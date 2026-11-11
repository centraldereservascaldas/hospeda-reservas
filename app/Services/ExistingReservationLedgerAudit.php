<?php

namespace App\Services;

use DateTimeImmutable;

/**
 * Read-only comparison of Stays booking and accounting views. This is not an
 * authorization to charge and is deliberately not connected to checkout.
 * Stays does not expose an atomic paginated reservation-ledger snapshot.
 */
class ExistingReservationLedgerAudit
{
    private const PAGE_SIZE = 100;

    private const MAX_PAGES = 20;

    private const MAX_DAYS = 366;

    private const MAX_CREDITS = 30;

    private const DEADLINE_SECONDS = 8;

    public function __construct(private readonly StaysExternalApiClient $stays) {}

    public function confirmsCandidate(string $code, string $reservationId, int $expectedTotalCents, int $expectedBalanceCents): bool
    {
        $audit = $this->inspect($code, $reservationId);

        return $audit['status'] === 'consistent_candidate' && $audit['total_cents'] === $expectedTotalCents
            && $audit['balance_cents'] === $expectedBalanceCents;
    }

    /** @param array<string, mixed> $snapshot */
    public function confirmsSnapshot(array $snapshot): bool
    {
        if (! is_string($snapshot['reservation_code'] ?? null) || ! is_string($snapshot['_id'] ?? null)
            || ! is_int($snapshot['reservation_total_cents'] ?? null) || ! is_int($snapshot['pending_amount_cents'] ?? null)) {
            return false;
        }
        $audit = $this->inspect($snapshot['reservation_code'], $snapshot['_id']);
        if (($snapshot['bootstrap_receivable'] ?? false) === true && ($snapshot['payment_id'] ?? null) === null) {
            return $audit['status'] === 'consistent_candidate' && $audit['total_cents'] === $snapshot['reservation_total_cents']
                && ($audit['pending_payment_id'] ?? null) === null && ($audit['pending_cents'] ?? null) === null
                && ($audit['balance_cents'] ?? null) === $snapshot['pending_amount_cents'];
        }

        return $audit['status'] === 'consistent_candidate' && $audit['total_cents'] === $snapshot['reservation_total_cents']
            && ($audit['pending_payment_id'] ?? null) === ($snapshot['payment_id'] ?? null)
            && ($audit['pending_provider_id'] ?? null) === ($snapshot['pending_provider_id'] ?? null)
            && ($audit['pending_cents'] ?? null) === $snapshot['pending_amount_cents']
            && is_int($audit['balance_cents'] ?? null) && $audit['balance_cents'] >= $snapshot['pending_amount_cents'];
    }

    /** @return array{status: string, reason: string, total_cents: int|null, paid_cents: int|null, balance_cents: int|null} */
    public function inspect(string $code, ?string $expectedReservationId = null): array
    {
        if (! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return $this->review('reservation_code_invalid');
        }
        $deadline = microtime(true) + self::DEADLINE_SECONDS;
        $path = '/booking/reservations/'.$code;
        $reservation = $this->getWithinDeadline($path, [], $deadline);
        $payments = $this->getWithinDeadline($path.'/payments', [], $deadline);
        if (! is_array($reservation) || ! is_array($payments) || ! array_is_list($payments)
            || ($reservation['id'] ?? null) !== $code || ! is_string($reservation['_id'] ?? null)
            || ! preg_match('/^[a-f0-9]{24}$/iD', $reservation['_id'])
            || ($expectedReservationId !== null && (! preg_match('/^[a-f0-9]{24}$/iD', $expectedReservationId) || ! hash_equals($expectedReservationId, $reservation['_id'])))
            || ! in_array($reservation['type'] ?? null, ['reserved', 'booked'], true)
            || ! is_string($reservation['partner']['name'] ?? null)
            || mb_strtolower(trim($reservation['partner']['name'])) !== 'api booking.com'
            || ($reservation['price']['currency'] ?? null) !== 'BRL') {
            return $this->review('reservation_unavailable_or_ineligible');
        }
        $total = MoneyAmount::toCents($reservation['price']['_f_total'] ?? null);
        $paid = MoneyAmount::toCents($reservation['stats']['_f_totalPaid'] ?? null);
        if ($total === null || $total <= 0 || $paid === null) {
            return $this->review('reported_paid_unverified');
        }
        $created = $reservation['creationDate'] ?? null;
        $start = is_string($created) ? DateTimeImmutable::createFromFormat('!Y-m-d', $created) : false;
        $end = DateTimeImmutable::createFromFormat('!Y-m-d', now('America/Sao_Paulo')->toDateString());
        if ($start === false || $end === false || $start->format('Y-m-d') !== $created
            || $start > $end || (int) $start->diff($end)->days > self::MAX_DAYS) {
            return $this->review('ledger_date_range_unavailable');
        }

        $first = $this->scanLedger($reservation['_id'], $start->format('Y-m-d'), $end->format('Y-m-d'), $deadline);
        if ($first === null) {
            return $this->review('ledger_unavailable_or_incomplete');
        }
        $listIds = [];
        foreach ($payments as $p) {
            if (! is_array($p) || ! in_array($p['type'] ?? null, ['credit', 'debit'], true)
                || ! is_string($p['_id'] ?? null) || ! preg_match('/^[a-f0-9]{24}$/iD', $p['_id']) || isset($listIds[$p['_id']])) {
                return $this->review('booking_payments_unverified');
            }
            $listIds[$p['_id']] = $p;
        }
        $completed = 0;
        $pending = [];
        $ledgerCreditIds = [];
        $creditDetails = [];
        foreach ($first as $id => $line) {
            if (($line['type'] ?? null) === 'debit') {
                if (! is_string($line['transactionName'] ?? null) || mb_strtolower(trim($line['transactionName'])) !== 'res. fee api booking.com') {
                    return $this->review('unclassified_debit');
                }
                $listedDebit = $listIds[$id] ?? null;
                if (! is_array($listedDebit) || ($listedDebit['type'] ?? null) !== 'debit' || ! is_bool($line['paid'] ?? null)
                    || ! in_array($listedDebit['status'] ?? null, ['pending', 'completed'], true)
                    || (($line['paid'] === true) !== (($listedDebit['status'] ?? null) === 'completed'))
                    || ($line['bankAccountId'] ?? null) !== ($listedDebit['_idpaymentProvider'] ?? null)
                    || MoneyAmount::toCents($line['_mcval']['BRL'] ?? null) === null
                    || MoneyAmount::toCents($line['_mcval']['BRL']) !== MoneyAmount::toCents($listedDebit['_f_val'] ?? null)) {
                    return $this->review('debit_views_disagree');
                }

                continue;
            }
            if (($line['type'] ?? null) !== 'credit' || ! is_bool($line['paid'] ?? null) || count($ledgerCreditIds) >= self::MAX_CREDITS) {
                return $this->review('credit_state_unverified');
            }
            $ledgerCreditIds[$id] = true;
            $detail = $this->getWithinDeadline($path.'/payments/'.rawurlencode($id), [], $deadline);
            $value = MoneyAmount::toCents($line['_mcval']['BRL'] ?? null);
            $bookingValue = is_array($detail) ? MoneyAmount::toCents($detail['_f_val'] ?? null) : null;
            $detailFee = is_array($detail) ? MoneyAmount::toCents($detail['_f_fee'] ?? 0) : null;
            $detailTax = is_array($detail) ? MoneyAmount::toCents($detail['_f_tax'] ?? 0) : null;
            $financeFee = MoneyAmount::toCents($line['payment']['_mcfee']['BRL'] ?? 0);
            $financeTax = MoneyAmount::toCents($line['payment']['_mctax']['BRL'] ?? 0);
            if (! is_array($detail) || ($detail['_id'] ?? null) !== $id || ($detail['_idreserve'] ?? null) !== $reservation['_id']
                || ($detail['type'] ?? null) !== 'credit' || $value === null || $value <= 0 || $bookingValue !== $value
                || ($line['bankAccountId'] ?? null) !== ($detail['_idpaymentProvider'] ?? null)
                || (($line['paid'] === true) !== (($detail['status'] ?? null) === 'completed'))
                || ! in_array($detail['status'] ?? null, ['pending', 'completed'], true)
                || ($line['paid'] && (($line['payment']['paymentDate'] ?? null) !== ($detail['paymentDate'] ?? null) || empty($detail['paymentDate'])))
                || $detailFee === null || $detailTax === null || $financeFee === null || $financeTax === null
                || (! $line['paid'] && ($detailFee > 0 || $detailTax > 0 || $financeFee > 0 || $financeTax > 0))) {
                return $this->review('credit_views_disagree');
            }
            // Entries missing from the booking collection can be internal or
            // scheduled: a direct lookup alone does not establish their role.
            if (! isset($listIds[$id]) || ! is_string($detail['_idpaymentProvider'] ?? null)) {
                return $this->review('unclassified_hidden_credit');
            }
            $listed = $listIds[$id];
            if (($listed['type'] ?? null) !== ($detail['type'] ?? null)
                || ($listed['status'] ?? null) !== ($detail['status'] ?? null)
                || ($listed['name'] ?? null) !== ($detail['name'] ?? null)
                || ($listed['_idpaymentProvider'] ?? null) !== ($detail['_idpaymentProvider'] ?? null)
                || ($listed['paymentDate'] ?? null) !== ($detail['paymentDate'] ?? null)
                || MoneyAmount::toCents($listed['_f_val'] ?? null) !== $bookingValue) {
                return $this->review('credit_views_disagree');
            }
            $creditDetails[$id] = $this->creditFingerprint($detail);
            if ($line['paid']) {
                if ($value > PHP_INT_MAX - $completed) {
                    return $this->review('paid_amount_overflow');
                }
                $completed += $value;
            } else {
                if (($detail['name'] ?? null) !== 'Pagamento da reserva' || ($detail['readonly'] ?? false) !== false) {
                    return $this->review('unclassified_pending_credit');
                }
                $pending[] = ['amount' => $value, 'id' => $id, 'provider' => $detail['_idpaymentProvider']];
            }
        }
        foreach ($listIds as $id => $p) {
            if (! isset($first[$id])) {
                return $this->review(($p['type'] ?? null) === 'credit' ? 'booking_credit_missing_from_ledger' : 'booking_debit_missing_from_ledger');
            }
        }
        $second = $this->scanLedger($reservation['_id'], $start->format('Y-m-d'), $end->format('Y-m-d'), $deadline);
        $after = $this->getWithinDeadline($path, [], $deadline);
        $afterPayments = $this->getWithinDeadline($path.'/payments', [], $deadline);
        if ($second === null || $this->fingerprint($first) !== $this->fingerprint($second)
            || ! is_array($after) || ! is_array($afterPayments)
            || $this->bookingFingerprint($reservation, $payments) !== $this->bookingFingerprint($after, $afterPayments)) {
            return $this->review('ledger_changed_during_audit');
        }
        foreach ($creditDetails as $id => $fingerprint) {
            $detail = $this->getWithinDeadline($path.'/payments/'.rawurlencode($id), [], $deadline);
            if (! is_array($detail) || $this->creditFingerprint($detail) !== $fingerprint) {
                return $this->review('credit_detail_changed');
            }
        }
        if ($paid < $completed) {
            return $this->review('reported_paid_disagrees_with_ledger');
        }
        $balance = max(0, $total - $paid);
        if ($balance > 0 && (count($pending) > 1 || (count($pending) === 1 && $pending[0]['amount'] > $balance))) {
            return $this->review('pending_amount_ambiguous');
        }
        if ($balance === 0 && $pending !== []) {
            return $this->review('paid_reservation_has_pending_credit');
        }

        return ['status' => 'consistent_candidate', 'reason' => 'ledger_views_agree_review_still_required',
            'total_cents' => $total, 'paid_cents' => $paid, 'balance_cents' => $balance,
            'pending_payment_id' => $pending[0]['id'] ?? null, 'pending_provider_id' => $pending[0]['provider'] ?? null,
            'pending_cents' => $pending[0]['amount'] ?? null];
    }

    /** @return array<string, array<string, mixed>>|null */
    private function scanLedger(string $reservationId, string $from, string $to, float $deadline): ?array
    {
        $lines = [];
        $seen = [];
        for ($page = 0; $page < self::MAX_PAGES; $page++) {
            $batch = $this->getWithinDeadline('/finance/accounting-transactions', [
                'from' => $from, 'to' => $to, 'dateType' => 'creation', 'limit' => self::PAGE_SIZE, 'skip' => $page * self::PAGE_SIZE,
            ], $deadline);
            if (! is_array($batch) || ! array_is_list($batch) || count($batch) > self::PAGE_SIZE) {
                return null;
            }
            foreach ($batch as $line) {
                if (! is_array($line)) {
                    return null;
                }
                if (array_key_exists('_id', $line)) {
                    $id = $line['_id'];
                    if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id) || isset($seen[strtolower($id)])) {
                        return null;
                    }
                    $seen[strtolower($id)] = true;
                }
                if (($line['reserveId'] ?? null) !== $reservationId) {
                    continue;
                }
                $id = $line['_id'] ?? null;
                if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id) || isset($lines[$id])) {
                    return null;
                }
                $lines[$id] = array_intersect_key($line, array_flip(['_id', 'reserveId', 'bankAccountId', 'transactionName', 'type', 'paid', '_mcval', 'payment', 'categoryId', 'companySplit', 'ownerSplit', 'responsible']));
            }
            if (count($batch) < self::PAGE_SIZE) {
                ksort($lines);

                return $lines;
            }
        }

        return null;
    }

    /** @param array<string, mixed> $query */
    private function getWithinDeadline(string $path, array $query, float $deadline): ?array
    {
        $remaining = $deadline - microtime(true);
        if ($remaining <= 0) {
            return null;
        }

        return $this->stays->get($path, $query, timeout: max(1, min(3, (int) ceil($remaining))));
    }

    private function fingerprint(array $value): string
    {
        return hash('sha256', json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    private function bookingFingerprint(array $reservation, array $payments): string
    {
        // Reduce exposure and compare only fields relevant to balance and identity.
        $fields = array_intersect_key($reservation, array_flip(['_id', 'id', 'type', '_idclient', '_idlisting', 'checkInDate', 'checkOutDate', 'guests', 'creationDate', 'partner', 'price', 'stats']));
        $payments = array_map(fn (mixed $p): mixed => is_array($p) ? array_intersect_key($p, array_flip(['_id', '_idreserve', '_idpaymentProvider', 'type', 'status', '_f_val', '_f_fee', '_f_tax', 'paymentDate', 'readonly', 'name'])) : $p, $payments);
        usort($payments, fn (mixed $a, mixed $b): int => strcmp(is_array($a) ? (string) ($a['_id'] ?? '') : '', is_array($b) ? (string) ($b['_id'] ?? '') : ''));

        return $this->fingerprint([$fields, $payments]);
    }

    private function creditFingerprint(array $detail): string
    {
        return $this->fingerprint(array_intersect_key($detail, array_flip(['_id', '_idreserve', '_idpaymentProvider', 'type', 'status', '_f_val', '_f_fee', '_f_tax', 'paymentDate', 'readonly', 'name'])));
    }

    private function review(string $reason): array
    {
        return ['status' => 'review_required', 'reason' => $reason, 'total_cents' => null, 'paid_cents' => null, 'balance_cents' => null];
    }
}
