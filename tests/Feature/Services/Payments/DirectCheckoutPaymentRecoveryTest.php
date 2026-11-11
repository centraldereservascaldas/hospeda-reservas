<?php

namespace Tests\Feature\Services\Payments;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\Payments\MercadoPagoClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DirectCheckoutPaymentRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_retry_timeout_does_not_overwrite_a_concurrent_approval(): void
    {
        $this->freezeTime();
        config(['services.mercadopago.access_token' => 'test-access-token', 'direct-booking.existing_reservation_checkout_enabled' => true,
            'direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true]);
        $order = $this->createPendingOrder();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'recover-race-attempt-001', 'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'mercadopago', 'stays_reservation_canonical_id' => str_repeat('a', 24),
            'gateway_idempotency_key' => 'same-gateway-key', 'payment_method' => 'pix', 'payment_method_id' => 'pix',
            'status' => 'unknown', 'amount' => '3001.00', 'currency' => 'BRL', 'expires_at' => now()->addHour(),
            'gateway_submission_started_at' => now()->subMinutes(10), 'gateway_submission_count' => 1,
            'gateway_retry_payload' => ['paymentMethodData' => ['payment_method_id' => 'pix'], 'additionalData' => []],
        ]);
        $order->update(['stays_reservation_id' => 'AB12C']);
        DB::table('stays_reservation_aliases')->insert(['canonical_id' => str_repeat('a', 24), 'reservation_code' => 'AB12C', 'created_at' => now(), 'updated_at' => now()]);
        $other = $order->replicate(['website_stays_reservation_id']);
        $other->forceFill(['origin' => 'stays_existing', 'stays_reservation_id' => str_repeat('a', 24), 'idempotency_key' => 'other-existing-order-001', 'public_reference' => 'other-existing-public-001'])->save();
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $this->mock(MercadoPagoClient::class)->shouldReceive('createPayment')->once()->andReturnUsing(function () use ($order, $attempt) {
            DirectBookingPaymentAttempt::query()->whereKey($attempt->id)->update(['status' => 'approved', 'gateway_status' => 'approved', 'gateway_payment_id' => '987654321']);
            $order->update(['status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'payment_status' => 'approved']);
            throw new \RuntimeException('timeout after webhook');
        });

        $result = app(DirectCheckoutPaymentService::class)->recoverPendingPayments();
        $this->assertSame(['processed' => 1, 'attention' => 0], $result);
        $this->assertSame('approved', $attempt->refresh()->status);
        $this->assertSame('approved', $order->refresh()->payment_status);
    }

    public function test_mismatched_gateway_response_does_not_overwrite_concurrent_approval(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $order = $this->createPendingOrder();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'mismatch-race-attempt-001', 'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'mercadopago', 'stays_reservation_canonical_id' => str_repeat('a', 24),
            'gateway_payment_id' => '987654321', 'payment_method' => 'pix', 'payment_method_id' => 'pix',
            'status' => 'pending', 'amount' => '3001.00', 'currency' => 'BRL', 'expires_at' => now()->addHour(),
        ]);
        $order->update(['stays_reservation_id' => 'AB12C']);
        DB::table('stays_reservation_aliases')->insert(['canonical_id' => str_repeat('a', 24), 'reservation_code' => 'AB12C', 'created_at' => now(), 'updated_at' => now()]);
        $other = $order->replicate(['website_stays_reservation_id']);
        $other->forceFill(['origin' => 'stays_existing', 'stays_reservation_id' => str_repeat('a', 24), 'idempotency_key' => 'other-existing-order-001', 'public_reference' => 'other-existing-public-001'])->save();
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $this->mock(MercadoPagoClient::class)->shouldReceive('getPayment')->once()->andReturnUsing(function () use ($order, $attempt) {
            DirectBookingPaymentAttempt::query()->whereKey($attempt->id)->update(['status' => 'approved', 'gateway_status' => 'approved']);
            $order->update(['status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'payment_status' => 'approved']);

            return ['id' => '987654321', 'status' => 'pending', 'transaction_amount' => 1, 'currency_id' => 'BRL', 'external_reference' => $order->id, 'payment_method_id' => 'pix'];
        });

        $result = app(DirectCheckoutPaymentService::class)->reconcileGatewayPayment('987654321');
        $this->assertSame('gateway_payment_mismatch', $result['code']);
        $this->assertSame('approved', $attempt->refresh()->status);
        $this->assertSame('approved', $order->refresh()->payment_status);
    }

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
