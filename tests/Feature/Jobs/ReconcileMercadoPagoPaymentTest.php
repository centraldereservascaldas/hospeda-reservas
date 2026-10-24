<?php

namespace Tests\Feature\Jobs;

use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            $this->assertSame('Gateway temporarily unavailable.', $exception->getMessage());
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
            $this->assertSame('The gateway payment could not be reconciled safely.', $exception->getMessage());
        }

        $webhook->refresh();
        $this->assertSame('retrying', $webhook->status);
        $this->assertSame(1, $webhook->reconciliation_attempts);
        $this->assertSame('payment_reconciliation_failed', $webhook->error_code);
        $this->assertNull($webhook->processed_at);
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
}
