<?php

namespace Tests\Feature\Services\Payments;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DirectCheckoutPaymentRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_stale_pending_payment_is_reconciled_from_gateway_after_webhook_was_missed(): void
    {
        $this->freezeTime();
        config(['services.mercadopago.access_token' => 'test-access-token']);
        Http::preventStrayRequests();

        $order = $this->createPendingOrder();
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'recover-pending-payment-test',
            'request_fingerprint' => str_repeat('b', 64),
            'gateway_payment_id' => '987654321',
            'payment_method' => 'pix',
            'payment_method_id' => 'pix',
            'status' => 'pending',
            'amount' => '3001.00',
            'currency' => 'BRL',
            'expires_at' => now()->addHour(),
        ]);
        $attempt->forceFill(['updated_at' => now()->subMinutes(10)])->save();
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

        $result = app(DirectCheckoutPaymentService::class)->recoverPendingPayments();

        $attempt->refresh();
        $order->refresh();
        $this->assertSame(['processed' => 1, 'attention' => 0], $result);
        $this->assertSame('approved', $attempt->status);
        $this->assertSame('approved', $attempt->gateway_status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $order->status);
        $this->assertSame('987654321', $order->gateway_payment_id);
        Http::assertSentCount(1);
    }

    private function createPendingOrder(): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => 'recover-pending-order-test',
            'public_reference' => 'recover-pending-order-public-test',
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
            'stays_reservation_id' => 'reservation-recover-test',
            'expires_at' => now()->addHour(),
            'payment_status' => 'pending',
            'payment_amount' => '3001.00',
            'payment_currency' => 'BRL',
            'payment_method' => 'pix',
            'payment_expires_at' => now()->addHour(),
            'operational_events' => [],
        ]);
    }
}
