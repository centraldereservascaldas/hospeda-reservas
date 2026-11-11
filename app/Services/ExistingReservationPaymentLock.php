<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ExistingReservationPaymentLock
{
    /** @var array<int, string> */
    private static array $sharedReservations = [];

    /** This experimental protocol must remain disabled until independently reviewed. */
    protected function sharedProtocolEnabled(): bool
    {
        return false;
    }

    /** Serialize decisions that may otherwise skip the reservation-specific lock. */
    public function synchronizedDecision(Closure $callback): mixed
    {
        if (isset(self::$sharedReservations[spl_object_id(DB::connection())])) {
            throw new \LogicException('Cannot upgrade a shared reservation decision lock.');
        }

        return DB::transaction(function () use ($callback): mixed {
            // A non-hex key cannot collide with a canonical reservation ID.
            $key = 'coordination-decision';
            $timestamp = now();
            DB::table('existing_reservation_payment_locks')->insertOrIgnore([
                'stays_reservation_id' => $key, 'created_at' => $timestamp, 'updated_at' => $timestamp,
            ]);
            DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $key)->lockForUpdate()->firstOrFail();

            return $callback();
        });
    }

    /**
     * Serialize database decisions for one canonical Stays reservation ID.
     *
     * The callback must only make database changes: never call a payment gateway
     * or Stays while holding a database transaction. Persist the claimed attempt
     * before committing so other workers and webhooks see it under the same lock.
     * Callers must check every outstanding attempt and reconciliation; this lock
     * alone does not make a charge safe or prevent outside manual payments.
     *
     * @template T
     *
     * @param  Closure(string): T  $callback
     * @return T
     */
    public function synchronized(string $reservationId, Closure $callback): mixed
    {
        if (! preg_match('/^[a-f0-9]{24}$/iD', $reservationId)) {
            throw new InvalidArgumentException('A canonical Stays reservation ID is required.');
        }

        $reservationId = strtolower($reservationId);

        $connection = DB::connection();
        $connectionId = spl_object_id($connection);
        if (isset(self::$sharedReservations[$connectionId])) {
            if (self::$sharedReservations[$connectionId] !== $reservationId) {
                throw new \LogicException('Cannot lock another reservation inside a shared reservation decision.');
            }

            return DB::transaction(fn (): mixed => $callback($reservationId));
        }

        $decision = function () use ($reservationId, $callback): mixed {
            $timestamp = now();
            DB::table('existing_reservation_payment_locks')->insertOrIgnore([
                'stays_reservation_id' => $reservationId,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);

            DB::table('existing_reservation_payment_locks')
                ->where('stays_reservation_id', $reservationId)
                ->lockForUpdate()
                ->firstOrFail();

            return $callback($reservationId);
        };

        if (! $this->sharedProtocolEnabled() || $connection->getDriverName() !== 'pgsql' || $connection->transactionLevel() > 0) {
            return $this->synchronizedDecision($decision);
        }

        return DB::transaction(function () use ($connectionId, $reservationId, $decision): mixed {
            $isolation = DB::selectOne('show transaction_isolation')->transaction_isolation;
            if ($isolation !== 'read committed') {
                return $this->synchronizedDecision($decision);
            }

            $timestamp = now();
            DB::table('existing_reservation_payment_locks')->insertOrIgnore([
                'stays_reservation_id' => 'coordination-decision', 'created_at' => $timestamp, 'updated_at' => $timestamp,
            ]);
            DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', 'coordination-decision')->sharedLock()->firstOrFail();

            self::$sharedReservations[$connectionId] = $reservationId;
            try {
                return $decision();
            } finally {
                unset(self::$sharedReservations[$connectionId]);
            }
        });
    }
}
