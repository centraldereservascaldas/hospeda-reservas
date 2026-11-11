<?php

namespace App\Services;

class ExistingReservationPaymentGuard
{
    public function __construct(private readonly ExistingReservationBalance $balance) {}

    /** @param array<string, mixed> $reservation
     * @param  array<int, mixed>  $payments
     * @param  array<string, mixed>  $snapshot
     */
    public function matches(array $reservation, array $payments, array $snapshot, bool $allowConfirmedTransition = false): bool
    {
        if (! $this->matchesReservation($reservation, $snapshot, $allowConfirmedTransition)) {
            return false;
        }

        if (! $this->matchesReportedPaid($reservation, $snapshot)) {
            return false;
        }

        $expectedAmount = $snapshot['pending_amount_cents'] ?? null;
        $expectedPaymentId = $snapshot['payment_id'] ?? null;
        if (! is_int($expectedAmount) || $expectedAmount <= 0
            || ! is_string($expectedPaymentId) || $expectedPaymentId === '') {
            return false;
        }

        $candidate = $this->balance->inspect($reservation, $payments);
        $matches = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === $expectedPaymentId));
        $expectedProvider = $snapshot['pending_provider_id'] ?? null;

        return $candidate['status'] === 'pending_candidate'
            && $candidate['candidate_cents'] === $expectedAmount
            && is_string($candidate['payment_id'])
            && hash_equals($expectedPaymentId, $candidate['payment_id'])
            && is_string($expectedProvider) && count($matches) === 1
            && ($matches[0]['_idpaymentProvider'] ?? null) === $expectedProvider;
    }

    /** @param array<string, mixed> $reservation
     * @param  array<string, mixed>  $snapshot
     */
    public function matchesReportedPaid(array $reservation, array $snapshot): bool
    {
        $reportedPaid = $this->balance->reportedPaid($reservation);

        return $reportedPaid !== null && array_key_exists('reported_paid_present', $snapshot)
            && array_key_exists('reported_paid_cents', $snapshot) && is_bool($snapshot['reported_paid_present'])
            && $reportedPaid['present'] === $snapshot['reported_paid_present']
            && $reportedPaid['cents'] === $snapshot['reported_paid_cents'];
    }

    /** @param array<string, mixed> $reservation
     * @param  array<string, mixed>  $snapshot
     */
    public function matchesReservation(array $reservation, array $snapshot, bool $allowConfirmedTransition = false): bool
    {
        foreach (['_id', '_idclient', '_idlisting', 'checkInDate', 'checkOutDate'] as $field) {
            if (! is_string($snapshot[$field] ?? null) || $snapshot[$field] === ''
                || ! is_string($reservation[$field] ?? null)
                || ! hash_equals($snapshot[$field], $reservation[$field])) {
                return false;
            }
        }

        if (! is_int($snapshot['guests'] ?? null) || $snapshot['guests'] <= 0
            || ! is_int($reservation['guests'] ?? null) || $reservation['guests'] !== $snapshot['guests']) {
            return false;
        }

        $price = $reservation['price'] ?? null;
        $partner = is_array($reservation['partner'] ?? null) ? ($reservation['partner']['name'] ?? null) : null;
        if (! is_array($price) || ($price['currency'] ?? null) !== 'BRL'
            || ! in_array($reservation['type'] ?? null, ['reserved', 'booked'], true)
            || ! is_string($partner) || mb_strtolower(trim($partner)) !== 'api booking.com') {
            return false;
        }
        if (($snapshot['bootstrap_receivable'] ?? false) === true) {
            $expectedType = $snapshot['reservation_type'] ?? null;
            $actualType = $reservation['type'];
            if (! in_array($expectedType, ['reserved', 'booked'], true)
                || ($snapshot['partner_name'] ?? null) !== mb_strtolower(trim($partner))
                || ($actualType !== $expectedType && ! ($allowConfirmedTransition && $expectedType === 'reserved' && $actualType === 'booked'))) {
                return false;
            }
        }
        $total = MoneyAmount::toCents($price['_f_total'] ?? null);
        $expectedTotal = $snapshot['reservation_total_cents'] ?? null;

        return is_int($expectedTotal) && $expectedTotal > 0 && $total === $expectedTotal;
    }
}
