<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

class ExistingReservationPaymentCycleRegistry
{
    /** Prepares read-only evidence before entering any transaction or reservation lock. */
    public function prepare(string $reservationId): ?array
    {
        if (DB::transactionLevel() !== 0 || ! preg_match('/^[a-f0-9]{24}$/iD', $reservationId)) {
            return null;
        }
        $verified = [];
        $verifiedCycles = [];
        $currentAudit = null;
        $auditsDisagree = false;
        if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true) {
            $cycles = DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', strtolower($reservationId))
                ->where('state', 'settled')->whereNotNull('direct_booking_payment_attempt_id')->get();
            foreach ($cycles as $cycle) {
                $audit = app(ExperimentalExistingCycleSettlement::class)->revalidateHistorical($cycle);
                if ($audit !== null) {
                    if ($currentAudit !== null && $currentAudit !== $audit) {
                        $auditsDisagree = true;
                    }
                    $currentAudit = $audit;
                    $verified[$cycle->direct_booking_payment_attempt_id] = $cycle->settlement_proof_hash;
                    $verifiedCycles[$cycle->id] = $cycle->settlement_proof_hash;
                }
            }
        }

        return compact('verified', 'verifiedCycles', 'currentAudit', 'auditsDisagree') + ['reservationId' => strtolower($reservationId)];
    }

    /**
     * Coordinates payment attempts for the feature-gated existing checkout.
     *
     * Only a validated Cielo card decline may close a cycle automatically.
     * Never clear active_reservation_id merely because a local timer expires.
     * A replay confirms identity only; it is not permission to charge again.
     *
     * @return array{status: string, cycle_id: string|null}
     */
    public function open(string $reservationId, string $orderId, string $idempotencyKey, ?string $verifiedCode = null, ?array $prepared = null): array
    {
        if (! preg_match('/^[a-f0-9]{24}$/iD', $reservationId)
            || ! preg_match('/^[A-Za-z0-9._~-]{16,128}$/D', $idempotencyKey)
            || ($verifiedCode !== null && ! preg_match('/^[A-Z0-9]{5}$/D', $verifiedCode))) {
            throw new InvalidArgumentException('A canonical reservation ID and valid idempotency key are required.');
        }

        $verified = ($prepared['reservationId'] ?? null) === strtolower($reservationId) && is_array($prepared['verified'] ?? null) ? $prepared['verified'] : [];
        $verifiedCycles = ($prepared['reservationId'] ?? null) === strtolower($reservationId) && is_array($prepared['verifiedCycles'] ?? null) ? $prepared['verifiedCycles'] : [];
        $currentAudit = ($prepared['reservationId'] ?? null) === strtolower($reservationId) ? ($prepared['currentAudit'] ?? null) : null;
        $auditsDisagree = ($prepared['auditsDisagree'] ?? true) !== false;
        try {
            return app(ExistingReservationPaymentLock::class)->synchronized($reservationId, function (string $canonical) use ($orderId, $idempotencyKey, $verifiedCode, $verified, $verifiedCycles, $currentAudit, $auditsDisagree): array {
                $order = DirectBookingOrder::query()->lockForUpdate()->find($orderId);
                if (! $order || strtolower((string) $order->stays_reservation_id) !== $canonical) {
                    return ['status' => 'order_reservation_mismatch', 'cycle_id' => null];
                }

                $existing = DB::table('existing_reservation_payment_cycles')->where('idempotency_key', $idempotencyKey)->first();
                if ($existing !== null) {
                    if ($existing->stays_reservation_id !== $canonical || $existing->direct_booking_order_id !== $orderId) {
                        return ['status' => 'idempotency_conflict', 'cycle_id' => null];
                    }

                    return ['status' => 'replayed', 'cycle_id' => $existing->id];
                }

                if (DB::table('existing_reservation_payment_cycles')->where('active_reservation_id', $canonical)->exists()) {
                    return ['status' => 'cycle_in_progress', 'cycle_id' => null];
                }

                if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) !== true
                    && DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $canonical)
                        ->where('state', 'settled')->whereNotNull('settlement_proof_hash')->exists()) {
                    return ['status' => 'payment_requires_reconciliation', 'cycle_id' => null];
                }

                if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true) {
                    $settled = DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $canonical)
                        ->where('state', 'settled')->lockForUpdate()->get();
                    if ($settled->isNotEmpty() && ($auditsDisagree || ! is_array($currentAudit))) {
                        return ['status' => 'payment_requires_reconciliation', 'cycle_id' => null];
                    }
                    foreach ($settled as $cycle) {
                        if (! isset($verifiedCycles[$cycle->id]) || ! is_string($cycle->settlement_proof_hash)
                            || ! hash_equals($verifiedCycles[$cycle->id], $cycle->settlement_proof_hash)
                            || ! app(ExperimentalExistingCycleSettlement::class)->recordedProofValid($cycle)) {
                            return ['status' => 'payment_requires_reconciliation', 'cycle_id' => null];
                        }
                        $balance = $currentAudit['balance_cents'] ?? null;
                        $snapshot = $order->quote_snapshot['existing_reservation'] ?? null;
                        $pending = $currentAudit['pending_cents'] ?? null;
                        $previousOrder = DirectBookingOrder::query()->find($cycle->direct_booking_order_id);
                        $previousPaymentId = $previousOrder?->quote_snapshot['existing_reservation']['payment_id'] ?? null;
                        if (! is_array($snapshot) || ! is_int($balance) || ! is_int($pending) || $pending <= 0 || $pending > $balance
                            || MoneyAmount::toCents($order->quote_total) !== $pending
                            || ($snapshot['pending_amount_cents'] ?? null) !== $pending
                            || ! is_string($previousPaymentId) || $previousPaymentId === ($snapshot['payment_id'] ?? null)
                            || ($currentAudit['pending_payment_id'] ?? null) !== ($snapshot['payment_id'] ?? null)
                            || ($currentAudit['pending_provider_id'] ?? null) !== ($snapshot['pending_provider_id'] ?? null)) {
                            return ['status' => 'payment_requires_reconciliation', 'cycle_id' => null];
                        }
                    }
                }

                $aliases = array_filter([$canonical, strtoupper($canonical), $verifiedCode]);
                $unresolved = DirectBookingPaymentAttempt::query()
                    ->where(fn ($query) => $query->where('stays_reservation_canonical_id', $canonical)
                        ->orWhereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', $aliases)))
                    ->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])
                    ->get();
                foreach ($unresolved as $attempt) {
                    $cycle = $attempt->status === 'approved' && isset($verified[$attempt->id])
                        ? DB::table('existing_reservation_payment_cycles')->where('direct_booking_payment_attempt_id', $attempt->id)->lockForUpdate()->first()
                        : null;
                    if (! $cycle || ! is_string($cycle->settlement_proof_hash) || ! hash_equals($verified[$attempt->id], $cycle->settlement_proof_hash)
                        || ! app(ExperimentalExistingCycleSettlement::class)->recordedProofValid($cycle)) {
                        return ['status' => 'payment_requires_reconciliation', 'cycle_id' => null];
                    }
                }

                $id = (string) Str::uuid();
                DB::table('existing_reservation_payment_cycles')->insert([
                    'id' => $id,
                    'stays_reservation_id' => $canonical,
                    'active_reservation_id' => $canonical,
                    'direct_booking_order_id' => $orderId,
                    'idempotency_key' => $idempotencyKey,
                    'state' => 'open',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return ['status' => 'opened', 'cycle_id' => $id];
            });
        } catch (UniqueConstraintViolationException) {
            return ['status' => 'cycle_conflict', 'cycle_id' => null];
        }
    }

    /** Must be called inside the reservation lock and the attempt-creation transaction. */
    public function bindAttempt(string $cycleId, DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt): bool
    {
        if (DB::transactionLevel() < 1 || $attempt->direct_booking_order_id !== $order->id || $attempt->status !== 'processing') {
            return false;
        }

        return DB::table('existing_reservation_payment_cycles')->where('id', $cycleId)
            ->where('direct_booking_order_id', $order->id)
            ->where('active_reservation_id', strtolower((string) $order->stays_reservation_id))
            ->where('state', 'open')->whereNull('direct_booking_payment_attempt_id')
            ->update(['direct_booking_payment_attempt_id' => $attempt->id, 'updated_at' => now()]) === 1;
    }

    /** Must be called while holding the same reservation lock after gateway validation. */
    public function closeDeclined(DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt): bool
    {
        if (DB::transactionLevel() < 1 || $attempt->direct_booking_order_id !== $order->id
            || $attempt->payment_method !== 'card' || $attempt->status !== 'rejected'
            || $attempt->gateway_status !== 'rejected' || ! is_string($attempt->gateway_payment_id)
            || $attempt->gateway_payment_id === '' || $attempt->gateway_provider !== $order->gateway_provider
            || ! is_string($order->gateway_merchant_id) || $order->gateway_merchant_id === ''
            || $attempt->gateway_merchant_id !== $order->gateway_merchant_id) {
            return false;
        }

        return DB::table('existing_reservation_payment_cycles')->where('direct_booking_payment_attempt_id', $attempt->id)
            ->where('direct_booking_order_id', $order->id)
            ->where('active_reservation_id', strtolower((string) $order->stays_reservation_id))
            ->where('state', 'open')
            ->update(['state' => 'declined', 'active_reservation_id' => null, 'updated_at' => now()]) === 1;
    }
}
