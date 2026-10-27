<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CheckoutPaymentControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'services.cielo.sop_client_id' => 'test-client-id',
            'services.cielo.sop_client_secret' => 'test-client-secret',
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
            'payment_status' => 'pending',
            'operational_events' => [],
        ]);
        $merchantOrderNumber = 'CRCNORDER123456';
        DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'cielo-attempt-idempotency',
            'request_fingerprint' => str_repeat('d', 64),
            'gateway_provider' => 'cielo_checkout',
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
}
