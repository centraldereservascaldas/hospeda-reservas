<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use Illuminate\Support\Facades\DB;

/** Experimental local state transition; it is not permission to charge. */
class ExperimentalExistingCycleSettlement
{
    /** Read-only revalidation; a later payment may legitimately change the balance. */
    public function revalidateHistorical(object $cycle): ?array
    {
        if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) !== true) {
            return null;
        }
        $valid = app(ExistingReservationPaymentLock::class)->synchronized($cycle->stays_reservation_id, function () use ($cycle): bool {
            $locked = DB::table('existing_reservation_payment_cycles')->where('id', $cycle->id)->lockForUpdate()->first();

            return $locked !== null && $this->recordedProofValid($locked);
        });
        if (! $valid) {
            return null;
        }
        $order = DirectBookingOrder::query()->find($cycle->direct_booking_order_id);
        $snapshot = $order?->quote_snapshot['existing_reservation'] ?? null;
        $action = $order?->staysActions()->where('action_type', 'settle_existing_receivable')->first();
        $proof = json_decode($cycle->settlement_proof ?? '', true);
        if (! is_array($snapshot) || ! $action || ! is_array($proof['audit'] ?? null)) {
            return null;
        }
        $audit = app(ExistingReservationLedgerAudit::class)->inspect($snapshot['reservation_code'], $snapshot['_id']);
        $paid = $audit['paid_cents'] ?? null;
        $oldPaid = $proof['audit']['paid_cents'] ?? null;
        if (($audit['status'] ?? null) !== 'consistent_candidate' || ! is_int($paid) || ! is_int($oldPaid) || $paid < $oldPaid
            || ($audit['total_cents'] ?? null) !== ($proof['audit']['total_cents'] ?? null)
            || ($audit['balance_cents'] ?? null) !== $audit['total_cents'] - $paid
            || ! $this->readback($snapshot, $action->request_snapshot)) {
            return null;
        }

        return $audit;
    }

    /** Verify local proof while holding the reservation lock; no external calls. */
    public function recordedProofValid(object $cycle): bool
    {
        if (DB::transactionLevel() < 1 || config('direct-booking.experimental_existing_cycle_settlement_enabled', false) !== true
            || ($cycle->state ?? null) !== 'settled' || ($cycle->active_reservation_id ?? null) !== null
            || ! is_string($cycle->settlement_proof ?? null) || ! is_string($cycle->settlement_proof_hash ?? null)) {
            return false;
        }
        $proof = json_decode($cycle->settlement_proof, true);
        $order = DirectBookingOrder::query()->lockForUpdate()->find($cycle->direct_booking_order_id);
        $attempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->find($cycle->direct_booking_payment_attempt_id);
        $action = $order?->staysActions()->where('action_type', 'settle_existing_receivable')->lockForUpdate()->first();
        $snapshot = $order?->quote_snapshot['existing_reservation'] ?? null;
        if (! is_array($proof) || ! is_array($proof['audit'] ?? null) || ! is_string($proof['local_hash'] ?? null)
            || ! $order || ! $attempt || ! $action || ! is_array($snapshot)
            || strtolower((string) $order->stays_reservation_id) !== $cycle->stays_reservation_id
            || $order->paymentAttempts()->where('status', 'approved')->count() !== 1
            || ! $this->validAction($order, $attempt, $action, $snapshot)
            || ! hash_equals($proof['local_hash'], $this->proof($order, $attempt, $action))) {
            return false;
        }

        return hash_equals($cycle->settlement_proof_hash, hash('sha256', json_encode([$proof['local_hash'], $proof['audit']], JSON_THROW_ON_ERROR)));
    }

    public function close(DirectBookingOrder $order): bool
    {
        if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) !== true) {
            return false;
        }
        $order->refresh();
        $snapshot = $order->quote_snapshot['existing_reservation'] ?? null;
        if ($order->origin !== 'stays_existing' || $order->payment_status !== 'approved' || ! is_array($snapshot)
            || ! is_string($snapshot['_id'] ?? null) || $snapshot['_id'] !== $order->stays_reservation_id
            || ! is_string($snapshot['reservation_code'] ?? null) || ! is_int($snapshot['reservation_total_cents'] ?? null)
            || ! is_int($snapshot['pending_amount_cents'] ?? null) || ($snapshot['reported_paid_present'] ?? null) !== true
            || ! is_int($snapshot['reported_paid_cents'] ?? null) || $snapshot['reported_paid_cents'] < 0
            || $snapshot['pending_amount_cents'] <= 0 || $snapshot['reported_paid_cents'] > $snapshot['reservation_total_cents'] - $snapshot['pending_amount_cents']) {
            return false;
        }
        $attempts = $order->paymentAttempts()->where('status', 'approved')->get();
        $action = $order->staysActions()->where('action_type', 'settle_existing_receivable')->first();
        if ($attempts->count() !== 1 || ! $action || ! $this->validAction($order, $attempts->first(), $action, $snapshot)) {
            return false;
        }
        $attempt = $attempts->first();
        $before = $this->proof($order, $attempt, $action);
        $audit = app(ExistingReservationLedgerAudit::class)->inspect($snapshot['reservation_code'], $snapshot['_id']);
        $expectedPaid = $snapshot['reported_paid_cents'] + $snapshot['pending_amount_cents'];
        if (($audit['status'] ?? null) !== 'consistent_candidate' || ($audit['total_cents'] ?? null) !== $snapshot['reservation_total_cents']
            || ($audit['paid_cents'] ?? null) !== $expectedPaid
            || ($audit['balance_cents'] ?? null) !== $snapshot['reservation_total_cents'] - $expectedPaid
            || ! $this->readback($snapshot, $action->request_snapshot)) {
            return false;
        }

        return app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $attempt, $action, $snapshot, $before, $audit): bool {
            $locked = DirectBookingOrder::query()->lockForUpdate()->find($order->id);
            $currentAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->find($attempt->id);
            $currentAction = DirectBookingStaysAction::query()->lockForUpdate()->find($action->id);
            if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) !== true
                || ! $locked || ! $currentAttempt || ! $currentAction || $locked->paymentAttempts()->where('status', 'approved')->count() !== 1
                || ! $this->validAction($locked, $currentAttempt, $currentAction, $snapshot)
                || ($locked->quote_snapshot['existing_reservation'] ?? null) !== $snapshot
                || ! hash_equals($before, $this->proof($locked, $currentAttempt, $currentAction))) {
                return false;
            }
            $cycleProof = hash('sha256', json_encode([$before, $audit], JSON_THROW_ON_ERROR));

            $existing = DB::table('existing_reservation_payment_cycles')->where('direct_booking_order_id', $locked->id)
                ->where('direct_booking_payment_attempt_id', $currentAttempt->id)->lockForUpdate()->first();
            if ($existing && $existing->state === 'settled' && $existing->active_reservation_id === null) {
                return is_string($existing->settlement_proof_hash) && hash_equals($existing->settlement_proof_hash, $cycleProof);
            }

            return DB::table('existing_reservation_payment_cycles')->where('direct_booking_order_id', $locked->id)
                ->where('direct_booking_payment_attempt_id', $currentAttempt->id)
                ->where('active_reservation_id', strtolower($locked->stays_reservation_id))->where('state', 'open')
                ->whereNull('settlement_proof_hash')->update(['state' => 'settled', 'active_reservation_id' => null,
                    'settlement_proof_hash' => $cycleProof, 'settlement_proof' => json_encode(['local_hash' => $before, 'audit' => $audit], JSON_THROW_ON_ERROR),
                    'updated_at' => now()]) === 1;
        });
    }

    private function validAction(DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt, DirectBookingStaysAction $action, array $snapshot): bool
    {
        $request = $action->request_snapshot;
        $response = $action->response_snapshot;

        return $order->origin === 'stays_existing' && $order->payment_status === 'approved'
            && $attempt->direct_booking_order_id === $order->id && $attempt->status === 'approved'
            && $action->direct_booking_order_id === $order->id && $action->action_type === 'settle_existing_receivable'
            && $action->status === 'succeeded' && $action->external_id === ($snapshot['payment_id'] ?? null)
            && is_array($response) && ($response['payment_id'] ?? null) === ($snapshot['payment_id'] ?? null)
            && ($response['status'] ?? null) === 'completed' && ($response['payment_date'] ?? null) === ($request['payment_date'] ?? null)
            && $action->attempt_count === 1 && is_array($request) && ($request['write_started'] ?? null) === true
            && ($request['attempt_id'] ?? null) === $attempt->id && ($request['payment_id'] ?? null) === ($snapshot['payment_id'] ?? null)
            && ($request['amount_cents'] ?? null) === ($snapshot['pending_amount_cents'] ?? null)
            && is_string($request['marker'] ?? null) && preg_match('/^CRCN_SETTLEMENT:[A-Za-z0-9]{32}$/D', $request['marker']) === 1
            && is_string($request['original_desc_hash'] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $request['original_desc_hash']) === 1
            && is_string($request['provider_id'] ?? null) && $request['provider_id'] !== ''
            && ($request['provider_id'] ?? null) === ($snapshot['pending_provider_id'] ?? null)
            && is_string($request['payment_date'] ?? null) && $attempt->paid_at !== null
            && $request['payment_date'] === $attempt->paid_at->setTimezone('America/Sao_Paulo')->toDateString()
            && is_string($attempt->gateway_payment_id) && $attempt->gateway_payment_id !== ''
            && $attempt->gateway_provider === $order->gateway_provider && $attempt->gateway_merchant_id === $order->gateway_merchant_id
            && is_string($order->gateway_merchant_id) && $order->gateway_merchant_id !== ''
            && is_string($request['attempt_hash'] ?? null) && hash_equals($request['attempt_hash'], $this->attemptHash($attempt))
            && MoneyAmount::toCents($attempt->base_amount ?? $attempt->amount) === $snapshot['pending_amount_cents'];
    }

    private function readback(array $snapshot, array $request): bool
    {
        $id = $snapshot['payment_id'] ?? null;
        if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id)) {
            return false;
        }
        $stays = app(StaysExternalApiClient::class);
        $payments = $stays->get('/booking/reservations/'.rawurlencode($snapshot['_id']).'/payments');
        $matches = is_array($payments) && array_is_list($payments) ? array_values(array_filter($payments, fn ($p) => is_array($p) && ($p['_id'] ?? null) === $id)) : [];
        $payment = count($matches) === 1 ? $matches[0] : null;
        $finance = $stays->get('/finance/accounting-transactions/'.rawurlencode($id));
        $marker = $request['marker'];
        $description = is_array($payment) ? ($payment['desc'] ?? null) : null;
        if (! is_string($description) || ! str_ends_with($description, $marker)) {
            return false;
        }
        $prefix = substr($description, 0, -strlen($marker));
        if ($prefix !== '' && ! str_ends_with($prefix, "\n")) {
            return false;
        }
        $original = $prefix === '' ? '' : substr($prefix, 0, -1);

        return hash_equals($request['original_desc_hash'], hash('sha256', $original))
            && ($payment['type'] ?? null) === 'credit' && ($payment['status'] ?? null) === 'completed'
            && ($payment['paymentDate'] ?? null) === $request['payment_date']
            && ($payment['_idpaymentProvider'] ?? null) === $request['provider_id']
            && MoneyAmount::toCents($payment['_f_val'] ?? null) === $snapshot['pending_amount_cents']
            && is_array($finance) && ($finance['_id'] ?? null) === $id && ($finance['reserveId'] ?? null) === $snapshot['_id']
            && ($finance['type'] ?? null) === 'credit' && ($finance['paid'] ?? null) === true
            && ($finance['bankAccountId'] ?? null) === $request['provider_id']
            && ($finance['payment']['paymentDate'] ?? null) === $request['payment_date']
            && MoneyAmount::toCents($finance['_mcval']['BRL'] ?? null) === $snapshot['pending_amount_cents'];
    }

    private function attemptHash(DirectBookingPaymentAttempt $attempt): string
    {
        return hash('sha256', json_encode([
            $attempt->id, $attempt->status, $attempt->gateway_payment_id, $attempt->gateway_provider, $attempt->gateway_merchant_id,
            $attempt->payment_method, $attempt->payment_method_id, $attempt->installments, $attempt->currency,
            $attempt->amount, $attempt->base_amount, $attempt->processing_fee_amount, $attempt->processing_fee_basis_points,
            $attempt->paid_at?->utc()->format('Y-m-d\TH:i:s.uP'), $attempt->expires_at?->utc()->format('Y-m-d\TH:i:s.uP'),
        ], JSON_THROW_ON_ERROR));
    }

    private function proof(DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt, DirectBookingStaysAction $action): string
    {
        return hash('sha256', json_encode([$order->id, $order->stays_reservation_id, $order->payment_status,
            $order->quote_snapshot, $this->attemptHash($attempt), $action->id, $action->status, $action->external_id,
            $action->attempt_count, $action->request_snapshot, $action->response_snapshot], JSON_THROW_ON_ERROR));
    }
}
