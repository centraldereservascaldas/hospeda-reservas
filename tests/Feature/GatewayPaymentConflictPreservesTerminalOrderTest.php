<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\CieloCheckoutPaymentService;
use App\Services\Payments\CieloClient;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\CieloSilentOrderPostClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\Payments\MercadoPagoClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Mockery;
use Tests\TestCase;

class GatewayPaymentConflictPreservesTerminalOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_initial_submission_keeps_invalid_gateway_ids_unknown_without_lookup(): void
    {
        config([
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.reservation_hold_minutes' => 60,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.mercadopago.access_token' => 'test-token',
            'services.mercadopago.webhook_secret' => 'test-secret',
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
        ]);
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado,
            'idempotency_key' => 'order-initial-invalid-id',
            'public_reference' => bin2hex(random_bytes(20)),
            'resume_token' => 'valid-resume-token',
            'resume_token_expires_at' => now()->addDay(),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2], 'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website',
            'reservation_status' => 'reserved', 'stays_reservation_id' => 'reservation-1',
            'expires_at' => now()->addHour(), 'operational_events' => [],
        ]);
        $reservations = $this->mock(DirectStaysReservationService::class);
        $reservations->shouldReceive('validateReservedOrderForPayment')->twice()->andReturn(true);
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->twice()->andReturn(['id' => ''], ['id' => 0]);
        $gateway->shouldNotReceive('getPayment');
        $payments = Mockery::mock(DirectCheckoutPaymentService::class, [
            $gateway,
            $this->mock(CieloClient::class),
            $reservations,
            $this->mock(CieloCheckoutPaymentService::class),
            $this->mock(CieloSilentOrderPostClient::class),
            app(CieloDirectConfiguration::class),
        ])->makePartial();
        $payments->shouldReceive('availableMethods')->andReturn(['pix']);
        app()->instance(DirectCheckoutPaymentService::class, $payments);

        foreach (['initial-invalid-id-01', 'initial-invalid-id-02'] as $idempotencyKey) {
            $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
                'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
            ], [
                'Idempotency-Key' => $idempotencyKey,
                'X-Checkout-Resume-Token' => 'valid-resume-token',
            ])->assertServiceUnavailable()->assertJsonPath('code', 'gateway_result_unknown');
            if ($idempotencyKey === 'initial-invalid-id-01') {
                $order = $order->replicate();
                $order->forceFill([
                    'status' => DirectBookingOrderStatus::PreReservado,
                    'idempotency_key' => 'order-initial-invalid-id-second',
                    'public_reference' => bin2hex(random_bytes(20)),
                    'stays_reservation_id' => 'reservation-2',
                    'payment_status' => null,
                ])->save();
            }
        }

        $this->assertSame(2, DirectBookingPaymentAttempt::query()->whereNull('gateway_payment_id')->count());
        $this->assertNotSame('approved', $order->refresh()->payment_status);
    }

    public function test_retry_does_not_persist_invalid_gateway_identifier(): void
    {
        config(['direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true]);
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => 'order-retry-invalid-id',
            'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2], 'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website',
            'payment_status' => 'unknown', 'expires_at' => now()->addHour(), 'operational_events' => [],
        ]);
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'attempt-retry-invalid-id',
            'request_fingerprint' => str_repeat('b', 64),
            'gateway_idempotency_key' => 'gateway-key-123456789',
            'payment_method' => 'pix', 'payment_method_id' => 'pix',
            'status' => 'unknown', 'amount' => '3001.00', 'currency' => 'BRL',
            'gateway_submission_started_at' => now()->subHour(),
            'gateway_submission_count' => 1,
            'gateway_retry_payload' => ['paymentMethodData' => ['payment_method_id' => 'pix'], 'additionalData' => []],
        ]);

        foreach (['', 0] as $invalidId) {
            $this->mock(MercadoPagoClient::class)
                ->shouldReceive('createPayment')->once()->andReturn(['id' => $invalidId]);
            $result = (fn () => $this->replayUnknownGatewaySubmission($attempt, Carbon::now()->subMinutes(5)))
                ->call(app(DirectCheckoutPaymentService::class));
            $this->assertSame(503, $result['status']);
            $this->assertNull($attempt->refresh()->gateway_payment_id);
            $this->assertSame('gateway_result_unknown', $attempt->error_code);
            $attempt->forceFill(['gateway_submission_started_at' => now()->subHour()])->save();
        }
    }

    public function test_invalid_gateway_ids_cannot_approve_payment_and_positive_ids_are_accepted(): void
    {
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => 'order-gateway-id-validation',
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
            'payment_status' => 'pending',
            'operational_events' => [],
        ]);
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'attempt-gateway-id-validation',
            'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix',
            'payment_method_id' => 'pix',
            'status' => 'pending',
            'amount' => '3001.00',
            'currency' => 'BRL',
        ]);

        foreach (['', '0', ' 1', 'abc', 0] as $invalidId) {
            $result = (fn () => $this->applyGatewayPayment($order, $attempt, [
                'id' => $invalidId,
                'status' => 'approved',
                'transaction_amount' => 3001,
                'currency_id' => 'BRL',
                'external_reference' => $order->id,
                'payment_method_id' => 'pix',
            ]))->call(app(DirectCheckoutPaymentService::class));

            $this->assertSame('gateway_payment_mismatch', $result['code']);
            $this->assertNull($attempt->refresh()->gateway_payment_id);
            $this->assertNotSame('approved', $order->refresh()->payment_status);
        }

        $result = (fn () => $this->applyGatewayPayment($order, $attempt, [
            'id' => '123456789012345678901234567890',
            'status' => 'pending',
            'transaction_amount' => 3001,
            'currency_id' => 'BRL',
            'external_reference' => $order->id,
            'payment_method_id' => 'pix',
        ]))->call(app(DirectCheckoutPaymentService::class));
        $this->assertSame('123456789012345678901234567890', $attempt->refresh()->gateway_payment_id);
        $this->assertSame('pending', $result['code']);
    }

    public function test_conflicting_gateway_id_preserves_terminal_order_states_and_financial_status(): void
    {
        foreach ([
            [DirectBookingOrderStatus::Reembolsado, 'refunded'],
            [DirectBookingOrderStatus::Contestado, 'charged_back'],
            [DirectBookingOrderStatus::Concluido, 'approved'],
        ] as $index => [$status, $paymentStatus]) {
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
                'gateway_payment_id' => (string) (123456789 + $index),
                'payment_method' => 'pix',
                'payment_method_id' => 'pix',
                'status' => 'approved',
                'amount' => '3001.00',
                'currency' => 'BRL',
            ]);

            $result = (fn () => $this->applyGatewayPayment($order, $attempt, [
                'id' => (string) (987654321 + $index),
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
