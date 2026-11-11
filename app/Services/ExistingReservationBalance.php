<?php

namespace App\Services;

/** Projects a potential guest receivable, never an authorization to charge. */
class ExistingReservationBalance
{
    /** @param array<string, mixed> $reservation
     * @param  array<int, mixed>  $payments
     * @return array{status: string, candidate_cents: int|null, payment_id: string|null}
     */
    public function inspect(array $reservation, array $payments): array
    {
        $review = ['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null];
        $price = $reservation['price'] ?? null;
        if (! in_array($reservation['type'] ?? null, ['reserved', 'booked'], true)
            || ! is_array($price) || ($price['currency'] ?? null) !== 'BRL') {
            return $review;
        }

        $total = MoneyAmount::toCents($price['_f_total'] ?? null);
        if ($total === null || $total <= 0 || ! array_is_list($payments)) {
            return $review;
        }

        // Stays may include amounts paid outside the list of reservation credits.
        // When this statistic exists, a proposed receivable cannot exceed what
        // remains after the amount Stays reports as already paid.
        $paidSnapshot = $this->reportedPaid($reservation);
        if ($paidSnapshot === null) {
            return $review;
        }
        $reportedPaid = $paidSnapshot['cents'];
        if ($reportedPaid !== null && $reportedPaid > $total) {
            return $review;
        }

        $partner = $reservation['partner']['name'] ?? null;
        if (! is_string($partner) || mb_strtolower(trim($partner)) !== 'api booking.com') {
            return $review;
        }

        $candidates = [];
        $completedCredits = 0;
        foreach ($payments as $payment) {
            if (! is_array($payment)) {
                return $review;
            }
            if (! in_array($payment['type'] ?? null, ['credit', 'debit'], true)
                || ! in_array($payment['status'] ?? null, ['pending', 'completed'], true)) {
                return $review;
            }
            // An unrecognised credit state could represent a guest payment;
            // never ignore it when deciding whether another charge is safe.
            if (($payment['type'] ?? null) === 'credit'
                && ! in_array($payment['status'] ?? null, ['pending', 'completed'], true)) {
                return $review;
            }
            if (($payment['type'] ?? null) === 'credit' && ($payment['status'] ?? null) === 'completed') {
                $completed = MoneyAmount::toCents($payment['_f_val'] ?? null);
                if ($completed === null || $completed > $total - $completedCredits) {
                    return $review;
                }
                $completedCredits += $completed;
            }
            if (($payment['type'] ?? null) !== 'credit' || ($payment['status'] ?? null) !== 'pending') {
                continue;
            }
            if (($payment['name'] ?? null) !== 'Pagamento da reserva') {
                return $review;
            }
            $amount = MoneyAmount::toCents($payment['_f_val'] ?? null);
            $id = $payment['_id'] ?? null;
            if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id)
                || ($payment['readonly'] ?? false) !== false || ! empty($payment['paymentDate'])
                || $amount === null || $amount <= 0 || $amount > $total) {
                return $review;
            }
            $candidates[] = ['amount' => $amount, 'id' => $id];
        }

        // When Stays reports an unpaid balance but has no guest receivable yet,
        // the checkout may create a pending credit for exactly that balance.
        // Without an authoritative paid amount, do not assume the full price is due.
        if ($candidates === [] && ($reportedPaid === null || $reportedPaid < $total)
            && ($reportedPaid === null || $reportedPaid >= $completedCredits)) {
            return ['status' => 'unrecorded_candidate', 'candidate_cents' => $reportedPaid === null ? $total : $total - $reportedPaid, 'payment_id' => null];
        }

        if (($reportedPaid !== null && $reportedPaid < $completedCredits)
            || count($candidates) !== 1 || $candidates[0]['amount'] > $total - $completedCredits
            || ($reportedPaid !== null && $candidates[0]['amount'] > $total - $reportedPaid)) {
            return $review;
        }

        return ['status' => 'pending_candidate', 'candidate_cents' => $candidates[0]['amount'], 'payment_id' => $candidates[0]['id']];
    }

    /** @param array<string, mixed> $reservation
     * @return array{present: bool, cents: int|null}|null
     */
    public function reportedPaid(array $reservation): ?array
    {
        if (! array_key_exists('stats', $reservation)) {
            return ['present' => false, 'cents' => null];
        }
        $stats = $reservation['stats'];
        if (! is_array($stats)) {
            return null;
        }
        if (! array_key_exists('_f_totalPaid', $stats)) {
            return ['present' => false, 'cents' => null];
        }
        $cents = MoneyAmount::toCents($stats['_f_totalPaid']);

        return $cents === null ? null : ['present' => true, 'cents' => $cents];
    }
}
