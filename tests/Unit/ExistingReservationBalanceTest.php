<?php

namespace Tests\Unit;

use App\Services\ExistingReservationBalance;
use PHPUnit\Framework\TestCase;

class ExistingReservationBalanceTest extends TestCase
{
    public function test_booking_guest_receivable_excludes_pending_commission(): void
    {
        $result = (new ExistingReservationBalance)->inspect($this->reservation('API booking.com', 395), [
            ['type' => 'debit', 'status' => 'pending', '_f_val' => 59.25, 'name' => 'res. fee API booking.com'],
            ['_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'],
        ]);

        $this->assertSame(['status' => 'pending_candidate', 'candidate_cents' => 19750, 'payment_id' => str_repeat('a', 24)], $result);
    }

    public function test_airbnb_payouts_are_not_assumed_to_be_guest_debt(): void
    {
        $result = (new ExistingReservationBalance)->inspect($this->reservation('API airbnb', 523.30), [
            ['type' => 'credit', 'status' => 'pending', '_f_val' => 428],
        ]);

        $this->assertSame(['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null], $result);
    }

    public function test_booking_reservation_without_reported_paid_amount_requires_review(): void
    {
        $service = new ExistingReservationBalance;
        $reservation = array_replace($this->reservation('API booking.com', 1016), ['type' => 'reserved']);
        $commission = ['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com'];

        $review = ['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null];
        $this->assertSame($review, $service->inspect(array_replace($reservation, ['type' => 'booked']), [$commission]));
        $this->assertSame($review, $service->inspect($reservation, []));
        $this->assertSame($review, $service->inspect($reservation, [array_replace($commission, ['name' => 'other debit'])]));
        $this->assertSame($review, $service->inspect($reservation, [$commission, ['type' => 'credit', 'status' => 'completed', '_f_val' => 508]]));
        $this->assertSame($review, $service->inspect($reservation, [array_replace($commission, ['_f_val' => 2000])]));

        $unpaid = array_replace($reservation, ['stats' => ['_f_totalPaid' => 0]]);
        $this->assertSame(['status' => 'unrecorded_candidate', 'candidate_cents' => 101600, 'payment_id' => null], $service->inspect($unpaid, [$commission]));
    }

    public function test_missing_ambiguous_or_excess_receivables_require_review(): void
    {
        $service = new ExistingReservationBalance;
        $reservation = $this->reservation('API booking.com', 395);
        $candidate = ['_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        foreach ([[], [$candidate, $candidate], [['type' => 'credit', 'status' => 'pending', '_f_val' => 20]], [array_replace($candidate, ['_id' => 'bad'])], [array_replace($candidate, ['readonly' => true])], [array_replace($candidate, ['paymentDate' => '2026-11-10'])]] as $payments) {
            $this->assertSame(['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null], $service->inspect($reservation, $payments));
        }
        $extra = array_replace($candidate, ['_f_val' => 500]);
        $this->assertSame(['status' => 'pending_candidate', 'candidate_cents' => 50000, 'payment_id' => str_repeat('a', 24)], $service->inspect($reservation, [$extra]));
        $this->assertSame(['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null], $service->inspect(array_replace($reservation, ['type' => 'canceled']), [$candidate]));
        $this->assertSame(['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null], $service->inspect($reservation, [$candidate, ['type' => 'credit', 'status' => 'processing', '_f_val' => 197.50]]));
        $this->assertSame(['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null], $service->inspect($reservation, [$candidate, ['type' => 'credit', '_f_val' => 197.50]]));
    }

    public function test_reported_paid_amount_cannot_be_lower_than_completed_credits(): void
    {
        $service = new ExistingReservationBalance;
        $reservation = array_replace($this->reservation('API booking.com', 395), ['stats' => ['_f_totalPaid' => 197.50]]);
        $pending = ['_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $completed = ['type' => 'credit', 'status' => 'completed', '_f_val' => 197.50];
        $this->assertSame('pending_candidate', $service->inspect($reservation, [$completed, $pending])['status']);
        $this->assertSame('review_required', $service->inspect($reservation, [array_replace($completed, ['_f_val' => 395]), $pending])['status']);
        $this->assertSame('review_required', $service->inspect($reservation, [array_replace($completed, ['_f_val' => 'invalid']), $pending])['status']);
    }

    public function test_reported_paid_may_include_extras_above_the_reservation_base_total(): void
    {
        $service = new ExistingReservationBalance;
        $reservation = array_replace($this->reservation('API booking.com', 395), ['stats' => ['_f_totalPaid' => 197.50]]);
        $pending = ['_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $this->assertSame('pending_candidate', $service->inspect($reservation, [$pending])['status']);
        $this->assertSame('pending_candidate', $service->inspect($reservation, [array_replace($pending, ['_f_val' => 395])])['status']);
        $this->assertSame('pending_candidate', $service->inspect(array_replace($reservation, ['stats' => ['_f_totalPaid' => 500]]), [$pending])['status']);
        $this->assertSame('review_required', $service->inspect(array_replace($reservation, ['stats' => ['_f_totalPaid' => 'invalid']]), [$pending])['status']);
        $this->assertSame('review_required', $service->inspect(array_replace($reservation, ['stats' => null]), [$pending])['status']);
        $this->assertSame('review_required', $service->inspect(array_replace($reservation, ['stats' => 'invalid']), [$pending])['status']);
        $completed = ['type' => 'credit', 'status' => 'completed', '_f_val' => 200];
        $this->assertSame('review_required', $service->inspect($reservation, [$pending, $completed])['status']);
    }

    public function test_unrecorded_balance_is_calculated_from_the_reported_paid_amount(): void
    {
        $service = new ExistingReservationBalance;
        $reservation = array_replace($this->reservation('API booking.com', 1016), ['stats' => ['_f_totalPaid' => 0]]);
        $commission = ['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com'];
        $this->assertSame('unrecorded_candidate', $service->inspect($reservation, [$commission])['status']);
        $this->assertSame(['status' => 'unrecorded_candidate', 'candidate_cents' => 91600, 'payment_id' => null], $service->inspect(array_replace($reservation, ['stats' => ['_f_totalPaid' => 100]]), [$commission]));
    }

    private function reservation(string $partner, int|float $total): array
    {
        return ['type' => 'booked', 'partner' => ['name' => $partner], 'price' => ['currency' => 'BRL', '_f_total' => $total]];
    }
}
