<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\ExperimentalExistingAccountingSettlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** These HTTP fakes test our assumptions only; they do not prove the real Stays contract. */
class ExperimentalExistingAccountingSettlementTest extends TestCase
{
    use RefreshDatabase;

    public function test_adapter_is_disabled_by_default_without_external_calls(): void
    {
        [$order] = $this->fixture();
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('experimental_disabled', app(ExperimentalExistingAccountingSettlement::class)->settle($order)['code']);
        Http::assertNothingSent();
    }

    public function test_simulated_update_uses_same_transaction_and_replays_without_second_patch(): void
    {
        [$order, $reservation, $payment, $accounting] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $completed = false;
        $this->fakeStays($reservation, $payment, $accounting, $completed);
        $service = app(ExperimentalExistingAccountingSettlement::class);
        $this->assertTrue($service->settle($order)['ready']);
        $this->assertTrue($service->settle($order)['ready']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
        Http::assertSent(fn (Request $request) => $request->method() === 'PATCH'
            && str_ends_with($request->url(), '/finance/accounting-transactions/'.str_repeat('a', 24))
            && $request->data() === ['bankAccountId' => str_repeat('f', 24), 'paid' => true, 'payment' => ['paymentDate' => '2026-11-10']]);
        Http::assertNotSent(fn (Request $request) => $request->method() === 'POST');
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'experimental_settle_accounting', 'status' => 'succeeded', 'external_id' => str_repeat('a', 24)]);
    }

    public function test_uncertain_update_is_never_retried_automatically(): void
    {
        [$order, $reservation, $payment, $accounting] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $completed = false;
        $this->fakeStays($reservation, $payment, $accounting, $completed, failPatch: true);
        $service = app(ExperimentalExistingAccountingSettlement::class);
        $this->assertSame('experimental_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertSame('experimental_settlement_already_started', $service->settle($order)['code']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'experimental_settle_accounting', 'status' => 'attention_required']);
    }

    public function test_accounting_mismatch_never_submits_an_update(): void
    {
        [$order, $reservation, $payment, $accounting] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $completed = false;
        $accounting['reserveId'] = 'different-reservation';
        $this->fakeStays($reservation, $payment, $accounting, $completed);
        $this->assertSame('experimental_source_changed', app(ExperimentalExistingAccountingSettlement::class)->settle($order)['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_success_response_without_cross_view_propagation_is_not_treated_as_settled(): void
    {
        [$order, $reservation, $payment, $accounting] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $completed = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, $accounting, &$completed) {
            if ($request->method() === 'PATCH') {
                $completed = true;

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($completed ? array_replace($accounting, ['paid' => true, 'bankAccountId' => str_repeat('f', 24), 'payment' => ['paymentDate' => '2026-11-10']]) : $accounting);
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$payment]);
            }

            return Http::response($reservation);
        });
        $service = app(ExperimentalExistingAccountingSettlement::class);
        $this->assertSame('experimental_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertSame('experimental_settlement_already_started', $service->settle($order)['code']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    public function test_surcharge_remains_blocked_until_accounting_rule_is_verified(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $order->paymentAttempts()->update(['amount' => '240.86']);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('experimental_fee_reconciliation_unverified', app(ExperimentalExistingAccountingSettlement::class)->settle($order)['code']);
        Http::assertNothingSent();
    }

    public function test_late_or_unverifiable_capture_never_updates_accounting(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $order->paymentAttempts()->update(['paid_at' => now(), 'expires_at' => now()->subMinute()]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('experimental_payment_after_expiration', app(ExperimentalExistingAccountingSettlement::class)->settle($order)['code']);
        $order->paymentAttempts()->update(['expires_at' => null]);
        $this->assertSame('experimental_payment_after_expiration', app(ExperimentalExistingAccountingSettlement::class)->settle($order)['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_existing_other_settlement_blocks_experimental_write(): void
    {
        [$order, $reservation, $payment, $accounting] = $this->fixture();
        config(['direct-booking.experimental_existing_accounting_settlement_enabled' => true]);
        $order->staysActions()->create(['action_type' => 'settle_existing_receivable', 'status' => 'processing', 'idempotency_key' => 'other-settlement', 'request_snapshot' => []]);
        $completed = false;
        $this->fakeStays($reservation, $payment, $accounting, $completed);
        $this->assertSame('experimental_settlement_already_started', app(ExperimentalExistingAccountingSettlement::class)->settle($order)['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    private function fakeStays(array $reservation, array $payment, array $accounting, bool &$completed, bool $failPatch = false): void
    {
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, $accounting, &$completed, $failPatch) {
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            if ($request->method() === 'PATCH') {
                if (! $failPatch) {
                    $completed = true;
                }

                return Http::response([], $failPatch ? 503 : 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($completed ? array_replace($accounting, ['paid' => true, 'bankAccountId' => str_repeat('f', 24), 'payment' => ['paymentDate' => '2026-11-10']]) : $accounting);
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', '_idpaymentProvider' => str_repeat('f', 24), 'paymentDate' => '2026-11-10']) : $payment]);
            }

            return Http::response($reservation);
        });
    }

    private function fixture(): array
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        $this->mock(ExistingReservationPaymentChannels::class)->shouldReceive('verifiedProvider')->andReturn(str_repeat('f', 24));
        $paymentId = str_repeat('a', 24);
        $oldProvider = str_repeat('b', 24);
        $snapshot = ['_id' => str_repeat('c', 24), '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750, 'reported_paid_present' => false, 'reported_paid_cents' => null, 'payment_id' => $paymentId, 'pending_provider_id' => $oldProvider, 'channel_provider_ids' => ['pix' => str_repeat('f', 24)]];
        $reservation = ['_id' => str_repeat('c', 24), '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'type' => 'booked', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 395]];
        $payment = ['_id' => $paymentId, '_idpaymentProvider' => $oldProvider, 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $accounting = ['_id' => $paymentId, 'reserveId' => str_repeat('c', 24), 'bankAccountId' => $oldProvider, 'type' => 'credit', 'paid' => false, '_mcval' => ['BRL' => 197.50]];
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'idempotency_key' => 'experimental-existing-test', 'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'stays_client_id' => 'client', 'stays_reservation_id' => str_repeat('c', 24), 'reservation_status' => 'booked', 'check_in' => '2026-11-13', 'check_out' => '2026-11-16', 'guests' => ['adults' => 4, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Test', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '197.50', 'currency' => 'BRL', 'quote_snapshot' => ['existing_reservation' => $snapshot], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => ['version' => 'test'], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'expires_at' => now()->addHours(3), 'payment_status' => 'approved', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'operational_events' => [],
        ]);
        $order->paymentAttempts()->create(['idempotency_key' => 'attempt-test', 'request_fingerprint' => str_repeat('b', 64), 'gateway_payment_id' => 'gateway-id', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'approved', 'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL', 'paid_at' => '2026-11-10 12:00:00', 'expires_at' => now()->addHours(3)]);

        return [$order, $reservation, $payment, $accounting];
    }
}
