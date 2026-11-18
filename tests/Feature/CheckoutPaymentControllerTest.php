<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Mockery;
use Tests\TestCase;

class CheckoutPaymentControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'services.cielo.checkout_sop_client_id' => 'test-client-id',
            'services.cielo.checkout_sop_client_secret' => 'test-client-secret',
            'services.cielo.checkout_merchant_id' => 'cielo-merchant-test',
        ]);
        Http::preventStrayRequests();
    }

    public function test_cielo_checkout_notification_records_cielo_as_the_authoritative_payment_source(): void
    {
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => 'checkout-order-idempotency',
            'public_reference' => str_repeat('a', 40),
            'resume_token' => str_repeat('b', 64),
            'resume_token_expires_at' => now()->addDays(30),
            'request_fingerprint' => str_repeat('c', 64),
            'listing_id' => 'listing-test',
            'stays_listing_id' => 'listing-test',
            'stays_client_id' => 'client-test',
            'reservation_status' => 'reserved',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0],
            'guest_name' => 'Checkout Guest',
            'guest_email' => 'checkout@example.test',
            'guest_phone' => '+5511999999999',
            'quote_total' => '3001.00',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1',
            'accepted_terms_snapshot' => ['version' => 'terms-test-1'],
            'terms_accepted_at' => now(),
            'origin' => 'website',
            'expires_at' => now()->addMinutes(20),
            'stays_reservation_id' => 'reservation-test',
            'gateway_provider' => 'cielo_checkout',
            'gateway_merchant_id' => 'cielo-merchant-test',
            'payment_status' => 'pending',
            'operational_events' => [],
        ]);
        $merchantOrderNumber = 'CRCNORDER123456';
        DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'cielo-attempt-idempotency',
            'request_fingerprint' => str_repeat('d', 64),
            'gateway_provider' => 'cielo_checkout',
            'gateway_merchant_id' => 'cielo-merchant-test',
            'gateway_idempotency_key' => $merchantOrderNumber,
            'payment_method' => 'card',
            'payment_method_id' => 'cielo_checkout',
            'installments' => 1,
            'status' => 'pending',
            'amount' => '3001.00',
            'currency' => 'BRL',
            'expires_at' => now()->addMinutes(20),
        ]);
        Http::fake([
            'https://cieloecommerce.cielo.com.br/api/public/v2/token' => Http::response(['access_token' => 'test-access-token'], 200),
            'https://cieloecommerce.cielo.com.br/api/public/v2/orders/checkoutorder123' => Http::response([
                'order_number' => $merchantOrderNumber,
                'checkout_cielo_order_number' => 'checkoutorder123',
                'amount' => 300100,
                'payment' => ['status' => 'Paid'],
            ], 200),
        ]);

        $this->postJson('/api/webhooks/cielo-checkout', [
            'checkout_cielo_order_number' => 'checkoutorder123',
            'order_number' => $merchantOrderNumber,
        ])->assertCreated()->assertJsonPath('success', true)->assertJsonPath('code', 'approved');

        $order->refresh();
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $order->status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame(
            'cielo_checkout_authoritative_lookup',
            collect($order->operational_events)->last()['source'],
        );
    }

    public function test_disabled_payment_attempt_is_logged_with_safe_context_only(): void
    {
        Log::spy();
        $order = $this->orderForCheckout('mercadopago');

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix',
            'paymentMethodId' => 'pix',
        ], [
            'Idempotency-Key' => 'attempt-key-for-disabled-pix',
            'X-Checkout-Resume-Token' => str_repeat('b', 64),
        ])->assertServiceUnavailable()->assertJsonPath('code', 'payments_disabled');

        Log::shouldHaveReceived('log')->once()->with('warning', 'checkout.payment.blocked', Mockery::on(
            static fn (array $context): bool => $context === [
                'event' => 'checkout.payment.blocked',
                'correlation_id' => $order->id,
                'order_id' => $order->id,
                'reason' => 'payments_disabled_or_not_ready',
            ],
        ));
    }

    public function test_cielo_checkout_cannot_switch_an_order_persisted_for_mercado_pago(): void
    {
        config([
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.resume_token_ttl_days' => 30,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'provider-test',
            'direct-booking.reservation_hold_minutes' => 60,
            'services.stays.client_id' => 'stays-client-test',
            'services.stays.client_secret' => 'stays-secret-test',
            'services.mercadopago.access_token' => 'mp-token-test',
            'services.mercadopago.webhook_secret' => 'mp-webhook-test',
            'services.mercadopago.public_key' => 'mp-public-test',
        ]);
        $order = $this->orderForCheckout('mercadopago');

        $this->postJson('/api/checkout/'.$order->public_reference.'/cielo-checkout', [
            'idempotencyKey' => 'attempt-key-for-cielo-checkout',
        ], [
            'Idempotency-Key' => 'attempt-key-for-cielo-checkout',
            'X-Checkout-Resume-Token' => str_repeat('b', 64),
        ])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'payments_disabled');

        Http::assertNothingSent();
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_expired_resume_token_cannot_create_a_cielo_checkout(): void
    {
        $order = $this->orderForCheckout('cielo_checkout');
        $order->forceFill(['resume_token_expires_at' => now()->subMinute()])->save();

        $this->postJson('/api/checkout/'.$order->public_reference.'/cielo-checkout', [
            'idempotencyKey' => 'attempt-key-for-cielo-checkout',
        ], [
            'Idempotency-Key' => 'attempt-key-for-cielo-checkout',
            'X-Checkout-Resume-Token' => str_repeat('b', 64),
        ])
            ->assertNotFound()
            ->assertJsonPath('code', 'checkout_not_found');

        Http::assertNothingSent();
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_hosted_cielo_order_cannot_be_charged_through_the_generic_payment_endpoint(): void
    {
        config([
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.resume_token_ttl_days' => 30,
            'direct-booking.send_confirmation_email' => false,
            'services.cielo.checkout_merchant_id' => 'cielo-merchant-test',
            'services.cielo.checkout_sop_client_id' => 'cielo-client-test',
            'services.cielo.checkout_sop_client_secret' => 'cielo-secret-test',
        ]);
        $order = $this->orderForCheckout('cielo_checkout', 'cielo-merchant-test');

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'card',
            'paymentMethodId' => 'Visa',
            'token' => 'gateway-token-test',
            'installments' => 1,
            'cardholderName' => 'Checkout Guest',
            'cardholderEmail' => 'checkout@example.test',
            'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901'],
        ], [
            'Idempotency-Key' => 'attempt-key-for-generic-endpoint',
            'X-Checkout-Resume-Token' => str_repeat('b', 64),
        ])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'payment_method_unavailable');

        Http::assertNothingSent();
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    private function orderForCheckout(string $gatewayProvider, ?string $merchantId = null): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado,
            'idempotency_key' => 'checkout-order-key-test',
            'public_reference' => str_repeat('e', 40),
            'resume_token' => str_repeat('b', 64),
            'resume_token_expires_at' => now()->addDays(30),
            'request_fingerprint' => str_repeat('f', 64),
            'listing_id' => 'listing-test',
            'stays_listing_id' => 'listing-test',
            'stays_client_id' => 'client-test',
            'reservation_status' => 'reserved',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0],
            'guest_name' => 'Checkout Guest',
            'guest_email' => 'checkout@example.test',
            'guest_phone' => '+5511999999999',
            'quote_total' => '3001.00',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1',
            'accepted_terms_snapshot' => ['version' => 'terms-test-1'],
            'terms_accepted_at' => now(),
            'origin' => 'website',
            'expires_at' => now()->addMinutes(20),
            'stays_reservation_id' => 'reservation-test',
            'gateway_provider' => $gatewayProvider,
            'gateway_merchant_id' => $merchantId,
            'payment_status' => 'pending',
            'operational_events' => [],
        ]);
    }
}
