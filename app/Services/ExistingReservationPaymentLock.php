<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ExistingReservationPaymentLock
{
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

        return DB::transaction(function () use ($reservationId, $callback): mixed {
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
        });
    }
}
