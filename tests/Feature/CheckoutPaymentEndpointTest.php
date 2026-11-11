<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Jobs\SendDirectBookingConfirmationEmail;
use App\Models\DirectBookingEmail;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\CieloClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\Payments\MercadoPagoClient;
use App\Services\StaysReservationIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CheckoutPaymentEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_mercadopago_will_not_start_while_reservation_release_is_claimed(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $order = $this->createPayableOrder();
        $order->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago']);
        DB::table('existing_reservation_payment_locks')->insert(['stays_reservation_id' => str_repeat('a', 24), 'release_order_id' => fake()->uuid(), 'created_at' => now(), 'updated_at' => now()]);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->once()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $this->mock(MercadoPagoClient::class)->shouldNotReceive('createPayment');

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'release-lock-mp-test-0001', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertStatus(409)->assertJsonPath('code', 'order_not_payable');
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_unrelated_existing_reservation_does_not_add_identity_lookup_after_rollback(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $website = $this->createPayableOrder();
        $website->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago']);
        DB::table('stays_reservation_aliases')->insert(['canonical_id' => str_repeat('a', 24), 'reservation_code' => 'AB12C', 'created_at' => now(), 'updated_at' => now()]);
        $other = $this->createPayableOrder();
        $other->update(['stays_reservation_id' => str_repeat('b', 24), 'origin' => 'stays_existing']);
        DB::table('stays_reservation_aliases')->insert(['canonical_id' => str_repeat('b', 24), 'reservation_code' => 'XY12Z', 'created_at' => now(), 'updated_at' => now()]);
        $this->mock(StaysReservationIdentity::class)->shouldNotReceive('resolve');
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')->once()->andReturn($this->pendingGatewayPayment($website));

        $this->postJson('/api/checkout/'.$website->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'unrelated-existing-rollback-01', 'X-Checkout-Resume-Token' => 'resume-token'])->assertCreated();
        $this->assertNull(DirectBookingPaymentAttempt::query()->sole()->stays_reservation_canonical_id);
    }

    public function test_unknown_short_code_after_rollback_fails_closed_when_stays_is_unavailable(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $website = $this->createPayableOrder();
        $website->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago']);
        $other = $this->createPayableOrder();
        $other->update(['stays_reservation_id' => str_repeat('b', 24), 'origin' => 'stays_existing']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->once()->andReturnNull();
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $this->mock(MercadoPagoClient::class)->shouldNotReceive('createPayment');

        $this->postJson('/api/checkout/'.$website->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'unknown-alias-rollback-001', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertStatus(409)->assertJsonPath('code', 'existing_reservation_unverified');
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_mercadopago_does_not_start_if_other_origin_has_active_attempt(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $website = $this->createPayableOrder();
        $website->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago']);
        $existing = $this->createPayableOrder();
        $existing->update(['stays_reservation_id' => str_repeat('a', 24), 'origin' => 'stays_existing']);
        $existing->paymentAttempts()->create(['idempotency_key' => 'other-origin-payment-001', 'request_fingerprint' => str_repeat('b', 64), 'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'pending', 'amount' => '3001.00', 'currency' => 'BRL']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->twice()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->twice()->andReturnTrue();
        $this->mock(MercadoPagoClient::class)->shouldNotReceive('createPayment');

        $this->postJson('/api/checkout/'.$website->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'cross-origin-mp-test-0001', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertStatus(409)->assertJsonPath('code', 'payment_attempt_in_progress');
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $this->postJson('/api/checkout/'.$website->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'cross-origin-mp-test-0002', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertStatus(409)->assertJsonPath('code', 'payment_attempt_in_progress');
        $this->assertDatabaseCount('direct_booking_payment_attempts', 1);
    }

    public function test_hosted_cielo_does_not_start_if_other_origin_has_active_attempt(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true, 'services.cielo.checkout_merchant_id' => 'hosted-merchant',
            'services.cielo.checkout_sop_client_id' => 'hosted-client', 'services.cielo.checkout_sop_client_secret' => 'hosted-secret']);
        $website = $this->createPayableOrder();
        $website->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'cielo_checkout', 'gateway_merchant_id' => 'hosted-merchant']);
        $existing = $this->createPayableOrder();
        $existing->update(['stays_reservation_id' => str_repeat('a', 24), 'origin' => 'stays_existing']);
        $existing->paymentAttempts()->create(['idempotency_key' => 'other-origin-payment-001', 'request_fingerprint' => str_repeat('b', 64), 'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'pending', 'amount' => '3001.00', 'currency' => 'BRL']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->twice()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->twice()->andReturnTrue();
        $this->mock(CieloClient::class)->shouldNotReceive('createCheckoutPage');

        $result = app(DirectCheckoutPaymentService::class)->createCieloCheckoutPage($website, 'cross-origin-hosted-0001');
        $this->assertSame('payment_attempt_in_progress', $result['code']);
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $result = app(DirectCheckoutPaymentService::class)->createCieloCheckoutPage($website, 'cross-origin-hosted-0002');
        $this->assertSame('payment_attempt_in_progress', $result['code']);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 1);
    }

    public function test_hosted_cielo_does_not_start_while_reservation_release_is_claimed(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true, 'services.cielo.checkout_merchant_id' => 'hosted-merchant',
            'services.cielo.checkout_sop_client_id' => 'hosted-client', 'services.cielo.checkout_sop_client_secret' => 'hosted-secret']);
        $order = $this->createPayableOrder();
        $order->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'cielo_checkout', 'gateway_merchant_id' => 'hosted-merchant']);
        DB::table('existing_reservation_payment_locks')->insert(['stays_reservation_id' => str_repeat('a', 24), 'release_order_id' => fake()->uuid(), 'created_at' => now(), 'updated_at' => now()]);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->once()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $this->mock(CieloClient::class)->shouldNotReceive('createCheckoutPage');

        $result = app(DirectCheckoutPaymentService::class)->createCieloCheckoutPage($order, 'release-hosted-test-0001');
        $this->assertSame('order_not_payable', $result['code']);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_mercadopago_attempt_persists_identity_and_applies_reply_under_reservation_lock(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $order = $this->createPayableOrder();
        $order->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->once()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')->once()->andReturn($this->pendingGatewayPayment($order));

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'website-mp-lock-test-0001', 'X-Checkout-Resume-Token' => 'resume-token'])->assertCreated();
        $this->assertSame(str_repeat('a', 24), DirectBookingPaymentAttempt::query()->sole()->stays_reservation_canonical_id);
        $this->assertDatabaseHas('existing_reservation_payment_locks', ['stays_reservation_id' => str_repeat('a', 24)]);
    }

    public function test_legacy_mercadopago_attempt_is_backfilled_before_reconciliation(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $order = $this->createPayableOrder();
        $order->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago', 'status' => DirectBookingOrderStatus::PagamentoPendente, 'payment_status' => 'pending']);
        $attempt = $order->paymentAttempts()->create(['idempotency_key' => 'legacy-mp-attempt-00001', 'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'mercadopago', 'gateway_payment_id' => '123456789', 'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'pending', 'amount' => '3001.00', 'currency' => 'BRL']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolveForLegacyOrder')->once()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(MercadoPagoClient::class)->shouldReceive('getPayment')->once()->andReturn($this->pendingGatewayPayment($order));

        $result = app(DirectCheckoutPaymentService::class)->reconcileGatewayPayment('123456789');
        $this->assertSame('pending', $result['attempt']->status);
        $this->assertSame(str_repeat('a', 24), $attempt->refresh()->stays_reservation_canonical_id);
    }

    public function test_mercadopago_timeout_cannot_overwrite_a_webhook_approval(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $order = $this->createPayableOrder();
        $order->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'mercadopago']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->once()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $this->mock(MercadoPagoClient::class)->shouldReceive('createPayment')->once()->andReturnUsing(function () use ($order) {
            DirectBookingPaymentAttempt::query()->sole()->update(['status' => 'approved', 'gateway_status' => 'approved', 'gateway_payment_id' => '123456789']);
            $order->update(['status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'payment_status' => 'approved']);
            throw new RuntimeException('synthetic timeout after webhook');
        });

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'],
            ['Idempotency-Key' => 'website-mp-timeout-0001', 'X-Checkout-Resume-Token' => 'resume-token'])->assertOk()->assertJsonPath('payment.status', 'approved');
        $this->assertSame('approved', DirectBookingPaymentAttempt::query()->sole()->status);
        $this->assertSame('approved', $order->refresh()->payment_status);
    }

    public function test_hosted_cielo_timeout_cannot_overwrite_a_webhook_approval(): void
    {
        $this->enablePayments();
        config(['direct-booking.existing_reservation_checkout_enabled' => true, 'services.cielo.checkout_merchant_id' => 'hosted-merchant',
            'services.cielo.checkout_sop_client_id' => 'hosted-client', 'services.cielo.checkout_sop_client_secret' => 'hosted-secret']);
        $order = $this->createPayableOrder();
        $order->update(['stays_reservation_id' => 'AB12C', 'gateway_provider' => 'cielo_checkout', 'gateway_merchant_id' => 'hosted-merchant']);
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->once()->andReturn(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $this->mock(CieloClient::class)->shouldReceive('createCheckoutPage')->once()->andReturnUsing(function () use ($order) {
            DirectBookingPaymentAttempt::query()->sole()->update(['status' => 'approved', 'gateway_status' => 'approved', 'gateway_payment_id' => 'hosted-id']);
            $order->update(['status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'payment_status' => 'approved']);
            throw new RuntimeException('synthetic timeout after webhook');
        });

        $result = app(DirectCheckoutPaymentService::class)->createCieloCheckoutPage($order, 'website-hosted-timeout-001');
        $this->assertSame('approved', $result['code']);
        $this->assertSame('approved', DirectBookingPaymentAttempt::query()->sole()->status);
        $this->assertSame('approved', $order->refresh()->payment_status);
    }

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

    public function test_late_pix_approval_after_hold_expiry_requires_operational_attention_without_confirmation(): void
    {
        $this->enablePayments();
        $this->freezeTime();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gateway = $this->mock(MercadoPagoClient::class);
        $gateway->shouldReceive('createPayment')->once()->andReturn(['id' => '123456789']);
        $gateway->shouldReceive('getPayment')
            ->twice()
            ->andReturn($this->pendingGatewayPayment($order), [
                ...$this->pendingGatewayPayment($order),
                'status' => 'approved',
                'date_approved' => now()->subMinute()->toIso8601String(),
            ]);

        $response = $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
        ], ['Idempotency-Key' => 'checkout-late-pix-approval-0001', 'X-Checkout-Resume-Token' => 'resume-token'])
            ->assertCreated()
            ->assertJsonPath('payment.status', 'pending');

        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('pending', $attempt->status);
        $this->assertSame('pending', $order->refresh()->payment_status);

        $this->travelTo($order->expires_at->copy()->addMinute());
        Queue::fake([SendDirectBookingConfirmationEmail::class]);

        $result = app(DirectCheckoutPaymentService::class)
            ->reconcileGatewayPayment('123456789');

        $attempt->refresh();
        $order->refresh();
        $this->assertSame('approved', $attempt->status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->status);
        $this->assertSame('approved', $result['attempt']?->status);
        $this->assertTrue(collect($order->operational_events)->contains(fn (array $event): bool => ($event['code'] ?? null) === 'payment_approved_after_hold'));
        $this->assertSame(0, $order->staysActions()->where('action_type', 'confirm_reservation')->count());
        $this->assertSame(0, DirectBookingEmail::query()->where('direct_booking_order_id', $order->id)->where('notification_type', 'confirmation')->count());
        Queue::assertNothingPushed();
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
