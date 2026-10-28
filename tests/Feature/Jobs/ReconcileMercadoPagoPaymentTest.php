<?php

namespace Tests\Feature\Jobs;

use App\Enums\DirectBookingOrderStatus;
use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\DirectCheckoutPaymentService;
use GuzzleHttp\Psr7\Response as PsrResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class ReconcileMercadoPagoPaymentTest extends TestCase
{
    use RefreshDatabase;

    public function test_successful_gateway_reconciliation_marks_webhook_processed_and_increments_attempts(): void
    {
        $webhook = $this->createWebhook();
        $payments = $this->mock(DirectCheckoutPaymentService::class);
        $payments->shouldReceive('reconcileGatewayPayment')
            ->once()
            ->with('987654321')
            ->andReturn([
                'attempt' => null,
                'code' => 'payment_reconciled',
                'status' => 200,
            ]);

        (new ReconcileMercadoPagoPayment($webhook->id))->handle($payments);

        $webhook->refresh();
        $this->assertSame('processed', $webhook->status);
        $this->assertSame(1, $webhook->reconciliation_attempts);
        $this->assertNull($webhook->error_code);
        $this->assertNotNull($webhook->processed_at);
    }

    public function test_transient_reconciliation_exception_marks_webhook_retrying_and_is_rethrown(): void
    {
        $webhook = $this->createWebhook();
        $payments = $this->mock(DirectCheckoutPaymentService::class);
        $payments->shouldReceive('reconcileGatewayPayment')
            ->once()
            ->with('987654321')
            ->andThrow(new RuntimeException('Gateway temporarily unavailable.'));

        try {
            (new ReconcileMercadoPagoPayment($webhook->id))->handle($payments);
            $this->fail('The reconciliation exception should be rethrown for queue retry.');
        } catch (RuntimeException $exception) {
            $this->assertSame('payment_reconciliation_failed', $exception->getMessage());
        }

        $webhook->refresh();
        $this->assertSame('retrying', $webhook->status);
        $this->assertSame(1, $webhook->reconciliation_attempts);
        $this->assertSame('payment_reconciliation_failed', $webhook->error_code);
        $this->assertNull($webhook->processed_at);
    }

    public function test_maximum_attempt_limit_marks_webhook_failed_without_reconciliation(): void
    {
        $webhook = $this->createWebhook();
        $webhook->forceFill([
            'status' => 'retrying',
            'reconciliation_attempts' => ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS,
        ])->save();
        $payments = $this->mock(DirectCheckoutPaymentService::class);
        $payments->shouldNotReceive('reconcileGatewayPayment');

        (new ReconcileMercadoPagoPayment($webhook->id))->handle($payments);

        $webhook->refresh();
        $this->assertSame('failed', $webhook->status);
        $this->assertSame(ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS, $webhook->reconciliation_attempts);
        $this->assertSame('reconciliation_attempt_limit_reached', $webhook->error_code);
        $this->assertNull($webhook->processed_at);
    }

    #[DataProvider('webhookStatusesThatDoNotRequireReconciliation')]
    public function test_processed_or_processing_webhook_is_ignored_without_incrementing_attempts(string $status): void
    {
        $webhook = $this->createWebhook();
        $webhook->forceFill([
            'status' => $status,
            'reconciliation_attempts' => 2,
        ])->save();
        $payments = $this->mock(DirectCheckoutPaymentService::class);
        $payments->shouldNotReceive('reconcileGatewayPayment');

        (new ReconcileMercadoPagoPayment($webhook->id))->handle($payments);

        $webhook->refresh();
        $this->assertSame($status, $webhook->status);
        $this->assertSame(2, $webhook->reconciliation_attempts);
    }

    public static function webhookStatusesThatDoNotRequireReconciliation(): array
    {
        return [
            'already processed' => ['processed'],
            'currently processing' => ['processing'],
        ];
    }

    public function test_service_unavailable_result_marks_webhook_retrying_and_is_rethrown(): void
    {
        $webhook = $this->createWebhook();
        $payments = $this->mock(DirectCheckoutPaymentService::class);
        $payments->shouldReceive('reconcileGatewayPayment')
            ->once()
            ->with('987654321')
            ->andReturn([
                'attempt' => null,
                'code' => 'gateway_unavailable',
                'status' => 503,
            ]);

        try {
            (new ReconcileMercadoPagoPayment($webhook->id))->handle($payments);
            $this->fail('A service-unavailable result should be rethrown for queue retry.');
        } catch (RuntimeException $exception) {
            $this->assertSame('payment_reconciliation_failed', $exception->getMessage());
        }

        $webhook->refresh();
        $this->assertSame('retrying', $webhook->status);
        $this->assertSame(1, $webhook->reconciliation_attempts);
        $this->assertSame('payment_reconciliation_failed', $webhook->error_code);
        $this->assertNull($webhook->processed_at);
    }

    public function test_terminal_queue_failure_marks_retrying_webhook_failed(): void
    {
        $webhook = $this->createWebhook();
        $webhook->forceFill([
            'status' => 'retrying',
            'reconciliation_attempts' => 3,
            'error_code' => 'stale_error',
        ])->save();

        (new ReconcileMercadoPagoPayment($webhook->id))->failed(new RuntimeException('Queue attempts exhausted.'));

        $webhook->refresh();
        $this->assertSame('failed', $webhook->status);
        $this->assertSame(3, $webhook->reconciliation_attempts);
        $this->assertSame('payment_reconciliation_failed', $webhook->error_code);
        $this->assertNull($webhook->processed_at);
    }

    public function test_gateway_http_failure_rethrows_status_without_response_body(): void
    {
        $webhook = $this->createWebhook();
        $payments = $this->mock(DirectCheckoutPaymentService::class);
        $payments->shouldReceive('reconcileGatewayPayment')
            ->once()
            ->with('987654321')
            ->andThrow(new RequestException(new ClientResponse(new PsrResponse(
                422,
                ['Content-Type' => 'application/json'],
                '{"message":"synthetic@example.invalid 11999990000"}',
            ))));

        try {
            (new ReconcileMercadoPagoPayment($webhook->id))->handle($payments);
            $this->fail('The HTTP failure should be rethrown for queue retry.');
        } catch (RuntimeException $exception) {
            $this->assertSame('payment_reconciliation_failed; gateway_http_status=422', $exception->getMessage());
            $this->assertStringNotContainsString('synthetic@example.invalid', $exception->getMessage());
            $this->assertStringNotContainsString('11999990000', $exception->getMessage());
        }

        $webhook->refresh();
        $this->assertSame('retrying', $webhook->status);
        $this->assertSame('payment_reconciliation_failed', $webhook->error_code);
    }

    public function test_terminal_queue_failure_at_attempt_limit_uses_limit_error_code(): void
    {
        $webhook = $this->createWebhook();
        $webhook->forceFill([
            'status' => 'retrying',
            'reconciliation_attempts' => ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS,
        ])->save();

        (new ReconcileMercadoPagoPayment($webhook->id))->failed(new RuntimeException('Queue attempts exhausted.'));

        $webhook->refresh();
        $this->assertSame('failed', $webhook->status);
        $this->assertSame(ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS, $webhook->reconciliation_attempts);
        $this->assertSame('reconciliation_attempt_limit_reached', $webhook->error_code);
        $this->assertNull($webhook->processed_at);
    }

    public function test_terminal_queue_failure_preserves_processed_webhook(): void
    {
        $webhook = $this->createWebhook();
        $processedAt = now()->subMinute()->startOfSecond();
        $webhook->forceFill([
            'status' => 'processed',
            'reconciliation_attempts' => 1,
            'processed_at' => $processedAt,
        ])->save();

        (new ReconcileMercadoPagoPayment($webhook->id))->failed(new RuntimeException('Late queue failure.'));

        $webhook->refresh();
        $this->assertSame('processed', $webhook->status);
        $this->assertSame(1, $webhook->reconciliation_attempts);
        $this->assertNull($webhook->error_code);
        $this->assertSame($processedAt->toISOString(), $webhook->processed_at?->toISOString());
    }

    public function test_real_reconciliation_processes_webhook_attempt_and_order_together(): void
    {
        config(['services.mercadopago.access_token' => 'test-access-token']);
        Http::preventStrayRequests();

        $order = $this->createPayableOrder();
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'reconcile-attempt-test',
            'request_fingerprint' => str_repeat('b', 64),
            'gateway_payment_id' => '987654321',
            'payment_method' => 'pix',
            'payment_method_id' => 'pix',
            'status' => 'pending',
            'amount' => '3001.00',
            'currency' => 'BRL',
        ]);
        $webhook = $this->createWebhook();
        Http::fake([
            'https://api.mercadopago.com/v1/payments/987654321' => Http::response([
                'id' => '987654321',
                'status' => 'approved',
                'transaction_amount' => 3001,
                'currency_id' => 'BRL',
                'external_reference' => $order->id,
                'payment_method_id' => 'pix',
            ], 200),
        ]);

        (new ReconcileMercadoPagoPayment($webhook->id))->handle(app(DirectCheckoutPaymentService::class));

        $webhook->refresh();
        $attempt->refresh();
        $order->refresh();
        $this->assertSame('processed', $webhook->status);
        $this->assertSame(1, $webhook->reconciliation_attempts);
        $this->assertNull($webhook->error_code);
        $this->assertNotNull($webhook->processed_at);
        $this->assertSame('approved', $attempt->status);
        $this->assertSame('approved', $attempt->gateway_status);
        $this->assertSame('987654321', $attempt->gateway_payment_id);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame('987654321', $order->gateway_payment_id);
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $order->status);
        Http::assertSentCount(1);
    }

    private function createWebhook(): DirectBookingPaymentWebhook
    {
        return DirectBookingPaymentWebhook::query()->create([
            'event_key' => hash('sha256', 'payment-event-reconcile-test'),
            'gateway_payment_id' => '987654321',
            'request_id' => 'request-reconcile-test',
            'status' => 'received',
            'received_at' => now(),
        ]);
    }

    private function createPayableOrder(): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => 'reconcile-order-test',
            'public_reference' => 'reconcile-order-public-test',
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'JQ08G',
            'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2],
            'guest_name' => 'Test Guest',
            'guest_email' => 'guest@example.test',
            'guest_phone' => '11999999999',
            'quote_total' => '3001.00',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1',
            'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(),
            'reservation_status' => 'reserved',
            'stays_reservation_id' => 'reservation-reconcile-test',
            'expires_at' => now()->addHour(),
            'operational_events' => [],
        ]);
    }
}
