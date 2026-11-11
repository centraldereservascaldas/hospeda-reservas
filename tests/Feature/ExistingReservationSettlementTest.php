<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\DirectStaysPaymentService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\ExistingReservationSettlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExistingReservationSettlementTest extends TestCase
{
    use RefreshDatabase;

    public function test_previously_captured_card_does_not_settle_base_when_experimental_check_is_off(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_card_amount_verification_enabled' => false]);
        $order->paymentAttempts()->first()->update(['payment_method' => 'card', 'installments' => 6,
            'amount' => '240.86', 'base_amount' => '197.50', 'processing_fee_amount' => '43.36', 'processing_fee_basis_points' => 1800]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('existing_card_fee_accounting_unverified', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_experimental_card_amount_check_does_not_claim_fee_accounting_is_complete(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_card_amount_verification_enabled' => true]);
        $order->paymentAttempts()->first()->update(['payment_method' => 'card', 'installments' => 6,
            'amount' => '240.86', 'base_amount' => '197.50', 'processing_fee_amount' => '43.36', 'processing_fee_basis_points' => 1800]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('existing_card_fee_accounting_unverified', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_experimental_card_amount_mismatch_prevents_stays_settlement(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_card_amount_verification_enabled' => true]);
        $order->paymentAttempts()->first()->update(['payment_method' => 'card', 'installments' => 6,
            'amount' => '240.85', 'base_amount' => '197.50', 'processing_fee_amount' => '43.36', 'processing_fee_basis_points' => 1800]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('existing_card_amount_mismatch', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_approved_payment_settles_the_same_receivable_once_and_replays_safely(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $completed = false;
        $settlementDesc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$reservation, $payment, &$completed, &$settlementDesc) {
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            if ($request->method() === 'PATCH') {
                $completed = true;
                $settlementDesc = $request['desc'];
                $reservation['stats']['_f_totalPaid'] = 395;

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $completed));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $settlementDesc, '_idpaymentProvider' => str_repeat('f', 24)]) : $payment]);
            }

            return Http::response($reservation);
        });

        $service = app(ExistingReservationSettlement::class);
        $this->assertTrue($service->settle($order)['ready']);
        $this->assertTrue($service->settle($order)['ready']);
        Http::assertSentCount(11);
        Http::assertSent(fn (Request $request) => $request->method() === 'PATCH' && $request['paymentDate'] === '2026-11-10' && $request['name'] === 'Pix API Cielo' && str_starts_with($request['desc'], 'CRCN_SETTLEMENT:'));
        $this->assertDatabaseCount('direct_booking_stays_actions', 1);
        $this->assertDatabaseHas('existing_reservation_payment_locks', ['stays_reservation_id' => str_repeat('c', 24)]);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'succeeded', 'external_id' => $payment['_id']]);
    }

    public function test_unconfirmed_write_is_not_retried_and_creates_no_duplicate(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => $request->method() === 'PATCH'
            ? Http::response([], 503)
            : Http::response(str_ends_with($request->url(), '/payments') ? [$payment] : $reservation));
        $service = app(ExistingReservationSettlement::class);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertFalse($service->settle($order)['ready']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'attention_required']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
        $this->assertCount(0, Http::recorded(fn (Request $request) => $request->method() === 'POST'));
    }

    public function test_reported_paid_rising_after_patch_does_not_prove_settlement_or_trigger_retry(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $changed = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, &$changed) {
            if ($request->method() === 'PATCH') {
                $changed = true;

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, false));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$payment]);
            }

            return Http::response($changed ? array_replace($reservation, ['stats' => ['_f_totalPaid' => 197.50]]) : $reservation);
        });

        $service = app(ExistingReservationSettlement::class);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertFalse($service->settle($order)['ready']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'attention_required']);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'PATCH'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'cielo') || in_array($r->method(), ['POST', 'DELETE'], true));
    }

    public function test_changed_balance_is_never_settled(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(str_ends_with($request->url(), '/payments') ? [array_replace($payment, ['_f_val' => 100])] : $reservation));
        $this->assertSame('existing_reservation_changed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() === 'PATCH' || $request->method() === 'POST');
    }

    public function test_ledger_change_after_capture_blocks_stays_write(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->once()->andReturnFalse();
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(str_ends_with($request->url(), '/payments') ? [$payment] : $reservation));
        $this->assertSame('existing_reservation_changed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_ledger_change_immediately_before_write_marks_attention_without_patch(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->twice()->andReturn(true, false);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(str_ends_with($request->url(), '/payments') ? [$payment] : $reservation));
        $this->assertSame('existing_payment_state_changed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'attention_required']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_financial_view_not_paid_blocks_confirmation_and_replay_does_not_write_again(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $completed = false;
        $settlementDesc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$reservation, $payment, &$completed, &$settlementDesc) {
            if ($request->method() === 'PATCH') {
                $completed = true;
                $settlementDesc = $request['desc'];
                $reservation['stats']['_f_totalPaid'] = 395;

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, false));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $settlementDesc]) : $payment]);
            }

            return Http::response($reservation);
        });
        $service = app(ExistingReservationSettlement::class);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertFalse($service->settle($order)['ready']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'attention_required']);
    }

    public function test_replay_rechecks_financial_view_and_never_submits_another_write(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $completed = false;
        $settlementDesc = null;
        $financeDiverged = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, &$completed, &$financeDiverged, &$settlementDesc) {
            if ($request->method() === 'PATCH') {
                $completed = true;
                $settlementDesc = $request['desc'];

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $completed && ! $financeDiverged));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $settlementDesc]) : $payment]);
            }

            return Http::response($reservation);
        });
        $service = app(ExistingReservationSettlement::class);
        $this->assertTrue($service->settle($order)['ready']);
        $financeDiverged = true;
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    #[DataProvider('financialMismatches')]
    public function test_financial_identity_amount_and_date_are_verified(string $field): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $completed = false;
        $settlementDesc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, $field, &$completed, &$settlementDesc) {
            if ($request->method() === 'PATCH') {
                $completed = true;
                $settlementDesc = $request['desc'];

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                $financial = $this->financial($reservation, $payment, $completed);
                if ($field === 'payment_date') {
                    $financial['payment']['paymentDate'] = '2026-11-09';
                } elseif ($field === '_mcval') {
                    $financial['_mcval']['BRL'] = 1;
                } else {
                    $financial[$field] = str_repeat('b', 24);
                }

                return Http::response($financial);
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $settlementDesc]) : $payment]);
            }

            return Http::response($reservation);
        });
        $this->assertSame('existing_settlement_unconfirmed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    public static function financialMismatches(): array
    {
        return ['payment ID' => ['_id'], 'reservation ID' => ['reserveId'], 'provider' => ['bankAccountId'], 'amount' => ['_mcval'], 'date' => ['payment_date']];
    }

    #[DataProvider('mutationsDuringReadback')]
    public function test_concurrent_mutation_during_readback_never_promotes_settlement(string $mutation): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $completed = false;
        $desc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($order, $reservation, $payment, $mutation, &$completed, &$desc) {
            if ($request->method() === 'PATCH') {
                $completed = true;
                $desc = $request['desc'];

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                if ($completed) {
                    $attempt = $order->paymentAttempts()->sole();
                    match ($mutation) {
                        'chargeback' => $order->update(['status' => DirectBookingOrderStatus::Contestado, 'payment_status' => 'chargeback']),
                        'attempt_status' => $attempt->update(['status' => 'rejected']),
                        'gateway_id' => $attempt->update(['gateway_payment_id' => 'different-payment']),
                        'merchant' => $attempt->update(['gateway_merchant_id' => 'different-merchant']),
                        'method' => $attempt->update(['payment_method' => 'card']),
                        'installments' => $attempt->update(['installments' => 3]),
                        'amount' => $attempt->update(['amount' => '198.50']),
                        'currency' => $attempt->update(['currency' => 'USD']),
                        'order_currency' => $order->update(['currency' => 'USD']),
                        'order_total' => $order->update(['quote_total' => '100.00']),
                        'paid_at' => $attempt->update(['paid_at' => '2026-11-10 13:00:00']),
                        'snapshot' => $order->update(['quote_snapshot' => ['existing_reservation' => ['changed' => true]]]),
                    };
                }

                return Http::response($this->financial($reservation, $payment, $completed));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $desc]) : $payment]);
            }

            return Http::response($reservation);
        });
        $this->assertSame('existing_settlement_unconfirmed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'attention_required']);
        $this->assertDatabaseMissing('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'succeeded']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    public static function mutationsDuringReadback(): array
    {
        return array_combine(['chargeback', 'attempt_status', 'gateway_id', 'merchant', 'method', 'installments', 'amount', 'currency', 'order_currency', 'order_total', 'paid_at', 'snapshot'],
            array_map(fn (string $name): array => [$name], ['chargeback', 'attempt_status', 'gateway_id', 'merchant', 'method', 'installments', 'amount', 'currency', 'order_currency', 'order_total', 'paid_at', 'snapshot']));
    }

    public function test_gateway_identity_changed_during_preflight_never_sends_patch(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $paymentReads = 0;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($order, $reservation, $payment, &$paymentReads) {
            if (str_ends_with($request->url(), '/payments')) {
                $paymentReads++;
                if ($paymentReads === 2) {
                    $order->paymentAttempts()->update(['gateway_payment_id' => 'changed-during-preflight']);
                }

                return Http::response([$payment]);
            }

            return Http::response($reservation);
        });
        $this->assertSame('existing_payment_state_changed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_legacy_succeeded_action_without_marker_and_attempt_identity_is_not_trusted(): void
    {
        [$order, , $payment] = $this->fixture();
        $order->staysActions()->create(['action_type' => 'settle_existing_receivable', 'status' => 'succeeded', 'attempt_count' => 1,
            'external_id' => $payment['_id'], 'idempotency_key' => 'legacy-unverifiable-settlement',
            'request_snapshot' => ['payment_id' => $payment['_id'], 'amount_cents' => 19750, 'payment_date' => '2026-11-10', 'provider_id' => str_repeat('f', 24)]]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('existing_settlement_unconfirmed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        Http::assertNothingSent();
    }

    public function test_eventual_visibility_is_reconciled_by_reading_only_and_preserving_original_description(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $payment['desc'] = 'Anotação anterior';
        $sent = false;
        $bookingVisible = false;
        $financeVisible = false;
        $desc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, &$sent, &$bookingVisible, &$financeVisible, &$desc) {
            if ($request->method() === 'PATCH') {
                $sent = true;
                $desc = $request['desc'];

                return Http::response([], 503);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $financeVisible));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$sent && $bookingVisible ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $desc]) : $payment]);
            }

            return Http::response($reservation);
        });
        $service = app(ExistingReservationSettlement::class);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertStringStartsWith("Anotação anterior\nCRCN_SETTLEMENT:", $desc);
        $bookingVisible = true;
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $financeVisible = true;
        $this->assertTrue($service->settle($order)['ready']);
        $this->assertTrue($service->settle($order)['ready']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'succeeded']);
    }

    public function test_uncertain_settlement_is_not_promoted_without_the_exact_marker(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $sent = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, &$sent) {
            if ($request->method() === 'PATCH') {
                $sent = true;

                return Http::response([], 503);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $sent));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$sent ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => 'Alteração externa']) : $payment]);
            }

            return Http::response($reservation);
        });
        $service = app(ExistingReservationSettlement::class);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    public function test_uncertain_settlement_is_not_promoted_if_original_description_changes(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $payment['desc'] = 'Anotação original';
        $sent = false;
        $desc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, &$sent, &$desc) {
            if ($request->method() === 'PATCH') {
                $sent = true;
                $desc = $request['desc'];

                return Http::response([], 503);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $sent));
            }
            if (str_ends_with($request->url(), '/payments')) {
                $tampered = $sent ? 'Alterada'.substr($desc, strlen('Anotação original')) : null;

                return Http::response([$sent ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $tampered]) : $payment]);
            }

            return Http::response($reservation);
        });
        $service = app(ExistingReservationSettlement::class);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertSame('existing_settlement_unconfirmed', $service->settle($order)['code']);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    public function test_processing_action_without_write_marker_is_not_promoted(): void
    {
        [$order, , $payment] = $this->fixture();
        $attempt = $order->paymentAttempts()->sole();
        $order->staysActions()->create(['action_type' => 'settle_existing_receivable', 'status' => 'processing', 'attempt_count' => 1,
            'idempotency_key' => 'interrupted-before-write', 'request_snapshot' => ['attempt_id' => $attempt->id, 'payment_id' => $payment['_id'],
                'provider_id' => str_repeat('f', 24), 'amount_cents' => 19750, 'payment_date' => '2026-11-10', 'marker' => 'CRCN_SETTLEMENT:'.str_repeat('x', 32), 'original_desc_hash' => hash('sha256', '')]]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('existing_settlement_unconfirmed', app(ExistingReservationSettlement::class)->settle($order)['code']);
        Http::assertNothingSent();
    }

    #[DataProvider('saoPauloPaymentDates')]
    public function test_payment_date_uses_sao_paulo_calendar(string $utc, string $expected): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $order->paymentAttempts()->update(['paid_at' => $utc]);
        $completed = false;
        $desc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $payment, $expected, &$completed, &$desc) {
            if ($request->method() === 'PATCH') {
                $this->assertSame($expected, $request['paymentDate']);
                $desc = $request['desc'];
                $completed = true;

                return Http::response([], 200);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                $financial = $this->financial($reservation, $payment, $completed);
                if ($completed) {
                    $financial['payment']['paymentDate'] = $expected;
                }

                return Http::response($financial);
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => $expected, 'desc' => $desc]) : $payment]);
            }

            return Http::response($reservation);
        });
        $this->assertTrue(app(ExistingReservationSettlement::class)->settle($order)['ready']);
    }

    public static function saoPauloPaymentDates(): array
    {
        return ['before midnight local' => ['2026-11-10 02:59:59', '2026-11-09'], 'after midnight local' => ['2026-11-10 03:00:00', '2026-11-10']];
    }

    public function test_experimental_action_blocks_standard_settlement_write(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $order->staysActions()->create(['action_type' => 'experimental_settle_accounting', 'status' => 'processing', 'idempotency_key' => 'other-experimental-settlement', 'request_snapshot' => []]);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(str_ends_with($request->url(), '/payments') ? [$payment] : $reservation));

        $this->assertSame('existing_settlement_already_started', app(ExistingReservationSettlement::class)->settle($order)['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_unapproved_payment_cannot_settle_a_receivable(): void
    {
        [$order] = $this->fixture();
        $order->paymentAttempts()->update(['status' => 'pending']);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('existing_payment_not_confirmable', app(ExistingReservationSettlement::class)->settle($order)['code']);
        Http::assertNothingSent();
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
    }

    public function test_late_existing_payment_never_settles_or_confirms_automatically(): void
    {
        [$order] = $this->fixture();
        $order->update(['status' => DirectBookingOrderStatus::AtencaoOperacional, 'expires_at' => now()->addHour()]);
        $order->paymentAttempts()->update(['expires_at' => now()->subMinute(), 'paid_at' => now()]);
        config(['direct-booking.confirmation_enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake();

        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);

        $this->assertFalse($result['ready']);
        $this->assertSame('existing_payment_after_expiration', $result['code']);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->fresh()->status);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_existing_payment_without_verifiable_expiry_never_settles_automatically(): void
    {
        [$order] = $this->fixture();
        $order->update(['status' => DirectBookingOrderStatus::AtencaoOperacional, 'expires_at' => now()->addHour()]);
        $order->paymentAttempts()->update(['expires_at' => null, 'paid_at' => now()]);
        config(['direct-booking.confirmation_enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake();

        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);

        $this->assertSame('existing_payment_after_expiration', $result['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_existing_payment_after_order_deadline_is_not_settled_even_if_pix_deadline_is_later(): void
    {
        [$order] = $this->fixture();
        $order->update(['status' => DirectBookingOrderStatus::AtencaoOperacional, 'expires_at' => now()->subMinute()]);
        $order->paymentAttempts()->update(['expires_at' => now()->addHour(), 'paid_at' => now()]);
        config(['direct-booking.confirmation_enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake();

        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);

        $this->assertSame('existing_payment_after_expiration', $result['code']);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
        Http::assertNothingSent();
    }

    public function test_booked_reservation_is_confirmed_only_after_existing_receivable_is_settled(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $order->update(['expires_at' => now()->addHours(3)]);
        config(['direct-booking.confirmation_enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.send_confirmation_email' => false]);
        $completed = false;
        $settlementDesc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$reservation, $payment, &$completed, &$settlementDesc) {
            if ($request->method() === 'PATCH') {
                $completed = true;
                $settlementDesc = $request['desc'];
                $reservation['stats']['_f_totalPaid'] = 395;

                return Http::response([]);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $completed));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$completed ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $settlementDesc, '_idpaymentProvider' => str_repeat('f', 24)]) : $payment]);
            }

            return Http::response($reservation);
        });

        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
        $this->assertTrue($result['ready']);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->fresh()->status);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'settle_existing_receivable', 'status' => 'succeeded']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'confirm_reservation', 'status' => 'succeeded']);
    }

    public function test_reserved_booking_is_confirmed_after_its_receivable_is_settled(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $order->update(['expires_at' => now()->addHours(3), 'reservation_status' => 'reserved']);
        $reservation['type'] = 'reserved';
        config(['direct-booking.confirmation_enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.send_confirmation_email' => false]);
        $paymentCompleted = false;
        $settlementDesc = null;
        $booked = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$reservation, $payment, &$paymentCompleted, &$booked, &$settlementDesc) {
            if ($request->method() === 'PATCH') {
                if (str_contains($request->url(), '/payments/')) {
                    $paymentCompleted = true;
                    $settlementDesc = $request['desc'];
                    $reservation['stats']['_f_totalPaid'] = 395;
                } else {
                    $booked = true;
                }

                return Http::response([]);
            }
            if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                return Http::response($this->financial($reservation, $payment, $paymentCompleted));
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([$paymentCompleted ? array_replace($payment, ['status' => 'completed', 'paymentDate' => '2026-11-10', 'desc' => $settlementDesc, '_idpaymentProvider' => str_repeat('f', 24)]) : $payment]);
            }

            return Http::response($booked ? array_replace($reservation, ['type' => 'booked']) : $reservation);
        });
        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
        $this->assertTrue($result['ready']);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->fresh()->status);
        $this->assertCount(2, Http::recorded(fn (Request $request) => $request->method() === 'PATCH'));
    }

    private function financial(array $reservation, array $payment, bool $paid): array
    {
        return ['_id' => $payment['_id'], 'reserveId' => $reservation['_id'], 'bankAccountId' => str_repeat('f', 24),
            'type' => 'credit', 'paid' => $paid, '_mcval' => ['BRL' => 197.50],
            ...($paid ? ['payment' => ['paymentDate' => '2026-11-10']] : [])];
    }

    private function fixture(): array
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        $this->mock(ExistingReservationPaymentChannels::class)->shouldReceive('verifiedProvider')->andReturn(str_repeat('f', 24));
        $paymentId = str_repeat('a', 24);
        $snapshot = ['_id' => str_repeat('c', 24), '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750, 'reported_paid_present' => true, 'reported_paid_cents' => 19750, 'payment_id' => $paymentId, 'pending_provider_id' => str_repeat('f', 24), 'channel_provider_ids' => ['pix' => str_repeat('f', 24)]];
        $reservation = ['_id' => str_repeat('c', 24), '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'type' => 'booked', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 197.50]];
        $payment = ['_idpaymentProvider' => str_repeat('f', 24), '_id' => $paymentId, 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'idempotency_key' => 'existing-test', 'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'stays_client_id' => 'client', 'stays_reservation_id' => str_repeat('c', 24), 'reservation_status' => 'booked', 'check_in' => '2026-11-13', 'check_out' => '2026-11-16', 'guests' => ['adults' => 4, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Test', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '197.50', 'currency' => 'BRL', 'quote_snapshot' => ['existing_reservation' => $snapshot], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => ['version' => 'test'], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'payment_status' => 'approved', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'operational_events' => [],
        ]);
        $order->paymentAttempts()->create(['idempotency_key' => 'attempt-test', 'request_fingerprint' => str_repeat('b', 64), 'gateway_payment_id' => 'gateway-id', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'approved', 'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL', 'paid_at' => '2026-11-10 12:00:00', 'expires_at' => now()->addHours(3)]);

        return [$order, $reservation, $payment];
    }
}
