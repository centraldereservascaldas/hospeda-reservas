<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\MercadoPagoClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CheckoutPaymentEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_replaying_payment_request_does_not_create_another_gateway_payment(): void
    {
        $this->enablePayments();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')->once()->andReturn($this->pendingGatewayPayment($order));

        $payload = ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'];
        $headers = ['Idempotency-Key' => 'checkout-payment-idem-0001', 'X-Checkout-Resume-Token' => 'resume-token'];
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $payload, $headers)
            ->assertCreated()
            ->assertJsonPath('replayed', false);
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $payload, $headers)
            ->assertOk()
            ->assertJsonPath('replayed', true);

        $this->assertSame(1, DirectBookingPaymentAttempt::query()->count());
        $this->assertSame('123456789', DirectBookingPaymentAttempt::query()->sole()->gateway_payment_id);
    }

    public function test_replaying_unknown_gateway_submission_does_not_create_duplicate_charge(): void
    {
        $this->enablePayments();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gatewayIdempotencyKey = null;
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')
            ->once()
            ->withArgs(function (string $amount, string $orderId, string $idempotencyKey) use (&$gatewayIdempotencyKey, $order): bool {
                $gatewayIdempotencyKey = $idempotencyKey;

                return $amount === '3001.00' && $orderId === $order->id;
            })
            ->andThrow(new RuntimeException('Gateway response timed out after submission.'));

        $payload = ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'];
        $headers = ['Idempotency-Key' => 'checkout-payment-timeout-0001', 'X-Checkout-Resume-Token' => 'resume-token'];
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $payload, $headers)
            ->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'gateway_result_unknown')
            ->assertJsonPath('payment.status', 'unknown');

        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('unknown', $attempt->status);
        $this->assertSame('gateway_result_unknown', $attempt->error_code);
        $this->assertSame($gatewayIdempotencyKey, $attempt->gateway_idempotency_key);
        $this->assertSame(1, $attempt->gateway_submission_count);
        $this->assertNotNull($attempt->gateway_submission_started_at);
        $this->assertNull($attempt->gateway_payment_id);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->refresh()->status);

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $payload, $headers)
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('code', 'unknown')
            ->assertJsonPath('replayed', true)
            ->assertJsonPath('payment.status', 'unknown');

        $attempt->refresh();
        $this->assertSame(1, DirectBookingPaymentAttempt::query()->count());
        $this->assertSame(1, $attempt->gateway_submission_count);
        $this->assertSame($gatewayIdempotencyKey, $attempt->gateway_idempotency_key);
        $this->assertNull($attempt->gateway_payment_id);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->refresh()->status);
    }

    public function test_reusing_payment_idempotency_key_with_different_payload_returns_conflict(): void
    {
        $this->enablePayments();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')->once()->andReturn($this->pendingGatewayPayment($order));
        $headers = ['Idempotency-Key' => 'checkout-payment-idem-0002', 'X-Checkout-Resume-Token' => 'resume-token'];

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
        ], $headers)->assertCreated();
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'card', 'paymentMethodId' => 'visa', 'token' => 'card-token',
            'installments' => 1, 'cardholderName' => 'Test Guest', 'cardholderEmail' => 'guest@example.test',
            'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901'],
        ], $headers)->assertConflict()->assertJsonPath('code', 'idempotency_key_reused');

        $this->assertSame(1, DirectBookingPaymentAttempt::query()->count());
    }

    public function test_payment_request_without_resume_token_or_verified_guest_is_not_authorized(): void
    {
        $this->enablePayments();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)->shouldNotReceive('validateReservedOrderForPayment');
        $this->mock(MercadoPagoClient::class)->shouldNotReceive('createPayment');

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
        ], ['Idempotency-Key' => 'checkout-payment-idem-0003'])
            ->assertNotFound()->assertJsonPath('code', 'checkout_not_found');

        $this->assertSame(0, DirectBookingPaymentAttempt::query()->count());
        $this->assertSame(DirectBookingOrderStatus::PreReservado, $order->refresh()->status);
    }

    public function test_gateway_amount_mismatch_does_not_approve_or_confirm_reservation(): void
    {
        $this->enablePayments();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')->once()->andReturn([
            ...$this->pendingGatewayPayment($order), 'status' => 'approved', 'transaction_amount' => 3002,
        ]);

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
        ], ['Idempotency-Key' => 'checkout-payment-idem-0004', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertStatus(503)->assertJsonPath('code', 'gateway_payment_mismatch');

        $this->assertNotSame('approved', $order->refresh()->payment_status);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->status);
        $this->assertSame(0, $order->staysActions()->where('action_type', 'confirm_reservation')->count());
        $this->assertSame('attention_required', DirectBookingPaymentAttempt::query()->sole()->status);
    }

    #[DataProvider('gatewayIdentityMismatchCases')]
    public function test_gateway_identity_mismatch_does_not_approve_or_confirm_reservation(string $field, mixed $value): void
    {
        $this->enablePayments();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')->once()->andReturn([
            ...$this->pendingGatewayPayment($order), 'status' => 'approved', $field => $value,
        ]);

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
        ], ['Idempotency-Key' => 'checkout-payment-'.strtolower($field).'-0005', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertStatus(503)->assertJsonPath('code', 'gateway_payment_mismatch');

        $this->assertSame('attention_required', DirectBookingPaymentAttempt::query()->sole()->status);
        $this->assertNotSame('approved', $order->refresh()->payment_status);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->status);
        $this->assertSame(0, $order->staysActions()->where('action_type', 'confirm_reservation')->count());
    }

    /** @return array<string, array{string, string}> */
    public static function gatewayIdentityMismatchCases(): array
    {
        return [
            'currency' => ['currency_id', 'USD'],
            'external reference' => ['external_reference', 'another-order-id'],
            'payment method' => ['payment_method_id', 'visa'],
        ];
    }

    private function enablePayments(): void
    {
        config([
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.reservation_hold_minutes' => 60,
            'direct-booking.resume_token_ttl_days' => 2,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.mercadopago.access_token' => 'test-token',
            'services.mercadopago.public_key' => 'test-public-key',
            'services.mercadopago.webhook_secret' => 'test-secret',
            'services.mercadopago.webhook_queue_connection' => 'database',
            'direct-booking.notification_queue_connection' => 'database',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
        ]);
    }

    private function createPayableOrder(): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado,
            'idempotency_key' => fake()->uuid(),
            'public_reference' => bin2hex(random_bytes(20)),
            'resume_token' => 'resume-token',
            'resume_token_expires_at' => now()->addDay(),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2], 'guest_name' => 'Test Guest',
            'guest_email' => 'guest@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website',
            'reservation_status' => 'reserved', 'stays_reservation_id' => 'reservation-1',
            'expires_at' => now()->addHour(), 'operational_events' => [],
        ]);
    }

    /** @return array<string, mixed> */
    private function pendingGatewayPayment(DirectBookingOrder $order): array
    {
        return [
            'id' => '123456789', 'status' => 'pending', 'transaction_amount' => 3001,
            'currency_id' => 'BRL', 'external_reference' => $order->id,
            'payment_method_id' => 'pix', 'date_of_expiration' => now()->addMinutes(45)->toIso8601String(),
        ];
    }
}
