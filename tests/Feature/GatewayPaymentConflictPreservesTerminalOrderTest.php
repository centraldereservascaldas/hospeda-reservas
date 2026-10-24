<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GatewayPaymentConflictPreservesTerminalOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_conflicting_gateway_id_preserves_terminal_order_states_and_financial_status(): void
    {
        foreach ([
            [DirectBookingOrderStatus::Reembolsado, 'refunded'],
            [DirectBookingOrderStatus::Contestado, 'charged_back'],
            [DirectBookingOrderStatus::Concluido, 'approved'],
        ] as [$status, $paymentStatus]) {
            $order = DirectBookingOrder::query()->create([
                'status' => $status,
                'idempotency_key' => 'order-'.fake()->uuid(),
                'public_reference' => bin2hex(random_bytes(20)),
                'request_fingerprint' => str_repeat('a', 64),
                'listing_id' => 'JQ08G',
                'stays_listing_id' => 'JQ08G',
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
                'payment_status' => $paymentStatus,
                'operational_events' => [],
            ]);
            $attempt = DirectBookingPaymentAttempt::query()->create([
                'direct_booking_order_id' => $order->id,
                'idempotency_key' => 'attempt-'.fake()->uuid(),
                'request_fingerprint' => str_repeat('b', 64),
                'gateway_payment_id' => 'original-'.fake()->uuid(),
                'payment_method' => 'pix',
                'payment_method_id' => 'pix',
                'status' => 'approved',
                'amount' => '3001.00',
                'currency' => 'BRL',
            ]);

            $result = (fn () => $this->applyGatewayPayment($order, $attempt, [
                'id' => 'conflicting-'.fake()->uuid(),
                'status' => 'approved',
                'transaction_amount' => 3001,
                'currency_id' => 'BRL',
                'external_reference' => $order->id,
                'payment_method_id' => 'pix',
            ]))->call(app(DirectCheckoutPaymentService::class));

            $this->assertSame('gateway_payment_id_conflict', $result['code']);
            $this->assertSame($status, $order->refresh()->status);
            $this->assertSame($paymentStatus, $order->payment_status);
            $this->assertSame('gateway_payment_id_conflict', $order->operational_events[array_key_last($order->operational_events)]['code']);
        }
    }
}
