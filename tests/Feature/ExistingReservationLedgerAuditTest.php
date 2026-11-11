<?php

namespace Tests\Feature;

use App\Services\ExistingReservationLedgerAudit;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Synthetic integrations only: they cannot establish Stays pagination or consistency guarantees. */
class ExistingReservationLedgerAuditTest extends TestCase
{
    public function test_complete_matching_ledger_yields_candidate_not_charge_authorization(): void
    {
        $this->configure();
        $this->fakeStays('consistent');
        $result = app(ExistingReservationLedgerAudit::class)->inspect('ZY92K');
        $this->assertSame(['status' => 'consistent_candidate', 'reason' => 'ledger_views_agree_review_still_required',
            'total_cents' => 10000, 'paid_cents' => 5000, 'balance_cents' => 5000,
            'pending_payment_id' => str_repeat('b', 24), 'pending_provider_id' => str_repeat('f', 24), 'pending_cents' => 5000], $result);
        $this->assertCount(2, Http::recorded(fn (Request $r) => str_contains($r->url(), '/finance/accounting-transactions')));
        Http::assertNotSent(fn (Request $r) => $r->method() !== 'GET');
    }

    public function test_hidden_credit_is_queried_by_id_but_its_role_is_not_assumed(): void
    {
        $this->configure();
        $this->fakeStays('hidden');
        $result = app(ExistingReservationLedgerAudit::class)->inspect('ZY92K');
        $this->assertSame('unclassified_hidden_credit', $result['reason']);
        $this->assertNull($result['balance_cents']);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/payments/'.str_repeat('b', 24)));
        Http::assertNotSent(fn (Request $r) => $r->method() !== 'GET');
    }

    public function test_candidate_is_bound_to_canonical_reservation_and_expected_amounts(): void
    {
        $this->configure();
        $this->fakeStays('consistent');
        $audit = app(ExistingReservationLedgerAudit::class);
        $this->assertTrue($audit->confirmsCandidate('ZY92K', str_repeat('c', 24), 10000, 5000));
        $this->assertFalse($audit->confirmsCandidate('ZY92K', str_repeat('d', 24), 10000, 5000));
        $this->assertFalse($audit->confirmsCandidate('ZY92K', str_repeat('c', 24), 10000, 4900));
        $this->assertFalse($audit->confirmsSnapshot(['_id' => str_repeat('c', 24), 'reservation_total_cents' => 10000, 'pending_amount_cents' => 5000]));
    }

    public function test_changed_paginated_ledger_requires_review(): void
    {
        $this->configure();
        $this->fakeStays('changed');
        $this->assertSame('ledger_changed_during_audit', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_incomplete_pagination_never_produces_candidate(): void
    {
        $this->configure();
        $this->fakeStays('full_pages');
        $this->assertSame('ledger_unavailable_or_incomplete', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_full_page_is_followed_by_next_page_on_both_scans(): void
    {
        $this->configure();
        $this->fakeStays('paginated');
        $this->assertSame('consistent_candidate', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['status']);
        $this->assertCount(4, Http::recorded(fn (Request $r) => str_contains($r->url(), '/finance/accounting-transactions')));
        $this->assertCount(2, Http::recorded(fn (Request $r) => str_contains($r->url(), '/finance/accounting-transactions') && (int) $r['skip'] === 100));
    }

    public function test_list_and_individual_payment_disagreement_requires_review(): void
    {
        $this->configure();
        $this->fakeStays('list_mismatch');
        $this->assertSame('credit_views_disagree', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_financial_paid_while_booking_payment_is_pending_requires_review(): void
    {
        $this->configure();
        $this->fakeStays('financial_paid_booking_pending');
        $audit = app(ExistingReservationLedgerAudit::class);
        $this->assertSame('credit_views_disagree', $audit->inspect('ZY92K')['reason']);
        $this->assertFalse($audit->confirmsSnapshot(['reservation_code' => 'ZY92K', '_id' => str_repeat('c', 24),
            'reservation_total_cents' => 10000, 'pending_amount_cents' => 5000,
            'payment_id' => str_repeat('b', 24), 'pending_provider_id' => str_repeat('f', 24)]));
        Http::assertNotSent(fn (Request $r) => $r->method() !== 'GET');
    }

    public function test_debit_missing_from_financial_scan_is_not_ignored(): void
    {
        $this->configure();
        $this->fakeStays('missing_debit');
        $this->assertSame('booking_debit_missing_from_ledger', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_stats_mismatch_is_not_silently_assumed(): void
    {
        $this->configure();
        $this->fakeStays('stats_mismatch');
        $this->assertSame('reported_paid_disagrees_with_ledger', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_payment_fee_with_unverified_semantics_requires_review(): void
    {
        $this->configure();
        $this->fakeStays('fee');
        $this->assertSame('credit_views_disagree', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_partial_pending_credit_is_bound_to_its_id_provider_and_amount(): void
    {
        $this->configure();
        $this->fakeStays('partial');
        $audit = app(ExistingReservationLedgerAudit::class);
        $result = $audit->inspect('ZY92K');
        $this->assertSame(5000, $result['balance_cents']);
        $this->assertSame(3000, $result['pending_cents']);
        $snapshot = ['reservation_code' => 'ZY92K', '_id' => str_repeat('c', 24), 'reservation_total_cents' => 10000,
            'pending_amount_cents' => 3000, 'payment_id' => str_repeat('b', 24), 'pending_provider_id' => str_repeat('f', 24)];
        $this->assertTrue($audit->confirmsSnapshot($snapshot));
        $snapshot['payment_id'] = str_repeat('d', 24);
        $this->assertFalse($audit->confirmsSnapshot($snapshot));
        $snapshot['payment_id'] = str_repeat('b', 24);
        $snapshot['pending_provider_id'] = str_repeat('d', 24);
        $this->assertFalse($audit->confirmsSnapshot($snapshot));
    }

    public function test_duplicate_id_from_another_reservation_invalidates_scan(): void
    {
        $this->configure();
        $this->fakeStays('duplicate_foreign');
        $this->assertSame('ledger_unavailable_or_incomplete', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_changed_detail_requires_review_even_when_lists_are_stable(): void
    {
        $this->configure();
        $this->fakeStays('changed_detail');
        $this->assertSame('credit_detail_changed', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_changed_list_name_requires_review(): void
    {
        $this->configure();
        $this->fakeStays('changed_list_name');
        $this->assertSame('ledger_changed_during_audit', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    public function test_different_list_and_detail_names_require_review(): void
    {
        $this->configure();
        $this->fakeStays('different_name');
        $this->assertSame('credit_views_disagree', app(ExistingReservationLedgerAudit::class)->inspect('ZY92K')['reason']);
    }

    private function configure(): void
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
    }

    private function fakeStays(string $mode): void
    {
        $reserveId = str_repeat('c', 24);
        $provider = str_repeat('f', 24);
        $a = str_repeat('a', 24);
        $b = str_repeat('b', 24);
        $reservation = ['id' => 'ZY92K', '_id' => $reserveId, '_idclient' => 'client', '_idlisting' => 'listing',
            'creationDate' => now('America/Sao_Paulo')->toDateString(), 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22',
            'guests' => 2, 'type' => 'booked', 'partner' => ['name' => 'API booking.com'],
            'price' => ['currency' => 'BRL', '_f_total' => 100], 'stats' => ['_f_totalPaid' => $mode === 'stats_mismatch' ? 0 : 50]];
        $details = [
            $a => ['_id' => $a, '_idreserve' => $reserveId, '_idpaymentProvider' => $provider, 'type' => 'credit', 'status' => 'completed', '_f_val' => 50, 'paymentDate' => '2026-11-10'],
            $b => ['_id' => $b, '_idreserve' => $reserveId, '_idpaymentProvider' => $provider, 'type' => 'credit', 'status' => 'pending', '_f_val' => 50, 'name' => 'Pagamento da reserva'],
        ];
        if ($mode === 'fee') {
            $details[$b]['_f_fee'] = 1;
        }
        if ($mode === 'partial') {
            $details[$b]['_f_val'] = 30;
        }
        $lines = [
            ['_id' => $a, 'reserveId' => $reserveId, 'bankAccountId' => $provider, 'type' => 'credit', 'paid' => true, '_mcval' => ['BRL' => 50], 'payment' => ['paymentDate' => '2026-11-10']],
            ['_id' => $b, 'reserveId' => $reserveId, 'bankAccountId' => $provider, 'type' => 'credit', 'paid' => false, '_mcval' => ['BRL' => 50]],
        ];
        if ($mode === 'partial') {
            $lines[1]['_mcval']['BRL'] = 30;
        }
        if ($mode === 'financial_paid_booking_pending') {
            $lines[1]['paid'] = true;
            $lines[1]['payment'] = ['paymentDate' => '2026-11-10'];
        }
        $scans = 0;
        $detailScans = 0;
        $bookingScans = 0;
        Http::preventStrayRequests();
        Http::fake(function (Request $r) use ($mode, $reservation, $details, $lines, $a, $b, &$scans, &$detailScans, &$bookingScans) {
            if (str_contains($r->url(), '/finance/accounting-transactions')) {
                $scans++;
                if ($mode === 'full_pages') {
                    return Http::response(array_fill(0, 100, ['reserveId' => 'other']));
                }
                if ($mode === 'paginated') {
                    return Http::response((int) $r['skip'] === 0 ? [...array_fill(0, 99, ['reserveId' => 'other']), $lines[0]] : [$lines[1]]);
                }
                $result = $lines;
                if ($mode === 'duplicate_foreign') {
                    $foreign = ['_id' => str_repeat('9', 24), 'reserveId' => 'other'];
                    $result = [...$result, $foreign, $foreign];
                }
                if ($mode === 'changed' && $scans === 2) {
                    $result[1]['_mcval']['BRL'] = 49;
                }

                return Http::response($result);
            }
            if (str_ends_with($r->url(), '/payments/'.$a)) {
                return Http::response($details[$a]);
            }
            if (str_ends_with($r->url(), '/payments/'.$b)) {
                $detailScans++;
                if ($mode === 'changed_detail' && $detailScans > 1) {
                    return Http::response(array_replace($details[$b], ['name' => 'Outro']));
                }

                return Http::response($details[$b]);
            }
            if (str_ends_with($r->url(), '/payments')) {
                $bookingScans++;

                return Http::response(match ($mode) {
                    'hidden' => [$details[$a]],
                    'list_mismatch' => [$details[$a], array_replace($details[$b], ['_f_val' => 49])],
                    'different_name' => [$details[$a], array_replace($details[$b], ['name' => 'Outro'])],
                    'changed_list_name' => [$details[$a], $bookingScans > 1 ? array_replace($details[$b], ['name' => 'Outro']) : $details[$b]],
                    'missing_debit' => [$details[$a], $details[$b], ['_id' => str_repeat('9', 24), 'type' => 'debit', 'status' => 'completed', '_f_val' => 10]],
                    default => array_values($details),
                });
            }

            return Http::response($reservation);
        });
    }
}
