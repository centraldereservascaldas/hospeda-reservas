<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\CieloCheckoutPaymentService;
use App\Services\Payments\CieloSilentOrderPostClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\Payments\MercadoPagoClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GatewayUnknownProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_persisted_provider_fails_closed_without_calling_mercado_pago(): void
    {
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => 'unknown-provider-order',
            'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'listing-test',
            'stays_listing_id' => 'listing-test',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2],
            'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test',
            'guest_phone' => '11999999999',
            'quote_total' => '3001.00',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1',
            'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(),
            'origin' => 'website',
            'operational_events' => [],
        ]);
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'unknown-provider-attempt',
            'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'removed_gateway',
            'gateway_payment_id' => 'payment-unknown-1',
            'payment_method' => 'card',
            'payment_method_id' => 'removed_gateway_card',
            'status' => 'unknown',
            'amount' => '3001.00',
            'currency' => 'BRL',
        ]);
        $mercadoPago = $this->mock(MercadoPagoClient::class);
        $mercadoPago->shouldNotReceive('getPayment');
        $payments = new DirectCheckoutPaymentService(
            $mercadoPago,
            $this->mock(DirectStaysReservationService::class),
            $this->mock(CieloCheckoutPaymentService::class),
            $this->mock(CieloSilentOrderPostClient::class),
        );

        $result = $payments->reconcileGatewayPayment('payment-unknown-1');

        $this->assertSame(503, $result['status']);
        $this->assertSame('unknown_gateway_provider', $result['code']);
        $this->assertSame('attention_required', $attempt->refresh()->status);
        $this->assertSame('unknown_gateway_provider', $attempt->error_code);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->refresh()->status);
    }
}
