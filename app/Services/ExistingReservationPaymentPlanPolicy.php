<?php

namespace App\Services;

use App\Models\DirectBookingOrder;

class ExistingReservationPaymentPlanPolicy
{
    public function contractEvidenceStatus(DirectBookingOrder $order): string
    {
        $terms = $order->accepted_terms_snapshot;
        if (! is_array($terms)) {
            return 'review';
        }
        $hasContract = array_key_exists('contract', $terms);
        $hasHash = array_key_exists('contract_content_hash', $terms);
        if (! $hasContract && ! $hasHash) {
            return 'missing';
        }
        if (! is_array($terms['contract'] ?? null) || ! is_string($terms['contract_content_hash'] ?? null)) {
            return 'review';
        }
        $encoded = json_encode($terms['contract'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return is_string($encoded) && hash_equals(hash('sha256', $encoded), $terms['contract_content_hash']) ? 'valid' : 'review';
    }

    public function fullBalanceMatches(array $reservation, array $candidate, ?array $reportedPaid): bool
    {
        $total = MoneyAmount::toCents($reservation['price']['_f_total'] ?? null);

        return is_int($total) && ($reportedPaid['present'] ?? null) === true
            && is_int($reportedPaid['cents'] ?? null) && $reportedPaid['cents'] >= 0 && $reportedPaid['cents'] < $total
            && ($candidate['candidate_cents'] ?? null) === $total - $reportedPaid['cents'];
    }

    public function depositMatches(array $reservation, array $candidate, ?array $reportedPaid): bool
    {
        $total = MoneyAmount::toCents($reservation['price']['_f_total'] ?? null);

        return $this->depositSettlementEnabled()
            && in_array($candidate['status'] ?? null, ['pending_candidate', 'unrecorded_candidate'], true)
            && is_int($total) && $total >= 2
            && ($reportedPaid['present'] ?? null) === true && ($reportedPaid['cents'] ?? null) === 0
            && (($candidate['status'] === 'pending_candidate' && in_array($candidate['candidate_cents'] ?? null, [$total, intdiv($total + 1, 2)], true))
                || ($candidate['status'] === 'unrecorded_candidate' && ($candidate['candidate_cents'] ?? null) === $total));
    }

    public function canStartOrderPayment(DirectBookingOrder $order, string $paymentMethod): bool
    {
        $snapshot = $order->quote_snapshot['existing_reservation'] ?? null;
        if ($this->contractEvidenceStatus($order) !== 'valid') {
            return false;
        }
        if (! is_array($snapshot)) {
            return false;
        }
        $plan = $snapshot['payment_plan'] ?? null;
        if ($plan === 'deposit') {
            return $this->depositSettlementEnabled()
                && $paymentMethod === 'pix' && ($snapshot['selected_payment_method'] ?? null) === 'pix'
                && ($snapshot['reported_paid_present'] ?? null) === true && ($snapshot['reported_paid_cents'] ?? null) === 0
                && is_int($snapshot['reservation_total_cents'] ?? null) && $snapshot['reservation_total_cents'] >= 2
                && ($snapshot['pending_amount_cents'] ?? null) === intdiv($snapshot['reservation_total_cents'] + 1, 2)
                && (($snapshot['bootstrap_receivable'] ?? false) === true
                    ? ($snapshot['payment_id'] ?? null) === null && ($snapshot['receivable_creation_timing'] ?? null) === 'after_capture'
                        && ($snapshot['outstanding_balance_cents'] ?? null) === $snapshot['reservation_total_cents']
                    : is_string($snapshot['payment_id'] ?? null) && in_array($snapshot['receivable_amount_cents'] ?? $snapshot['pending_amount_cents'], [$snapshot['reservation_total_cents'], $snapshot['pending_amount_cents']], true))
                && MoneyAmount::toCents($order->quote_total) === $snapshot['pending_amount_cents'];
        }
        if ($plan === null) {
            return $this->legacyOrderCoversRemainingBalance($order);
        }

        return $plan === 'full';
    }

    private function depositSettlementEnabled(): bool
    {
        return config('direct-booking.experimental_existing_deposit_enabled', false) === true
            && config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true
            && config('direct-booking.experimental_existing_ledger_audit_enabled', false) === true;
    }

    public function legacyOrderCoversRemainingBalance(DirectBookingOrder $order): bool
    {
        $snapshot = $order->quote_snapshot['existing_reservation'] ?? null;
        if (! is_array($snapshot) || ($snapshot['payment_plan'] ?? null) !== null
            || ($snapshot['reported_paid_present'] ?? null) !== true
            || ! is_int($snapshot['reported_paid_cents'] ?? null)
            || ! is_int($snapshot['reservation_total_cents'] ?? null)
            || ! is_int($snapshot['pending_amount_cents'] ?? null)) {
            return false;
        }
        $paid = $snapshot['reported_paid_cents'];
        $total = $snapshot['reservation_total_cents'];

        return $paid >= 0 && $paid < $total && $snapshot['pending_amount_cents'] === $total - $paid
            && MoneyAmount::toCents($order->quote_total) === $snapshot['pending_amount_cents'];
    }
}
