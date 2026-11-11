<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The entry flag may be rolled back while shared reservations remain active. */
class ReservationCoordinationMode
{
    public function isRequired(?DirectBookingOrder $order = null): bool
    {
        if (config('direct-booking.existing_reservation_checkout_enabled', false) === true || $order?->origin === 'stays_existing') {
            return true;
        }
        $existingOrders = fn () => DirectBookingOrder::query()->where('origin', 'stays_existing');
        $hasLocks = Schema::hasTable('existing_reservation_payment_locks') && Schema::hasColumn('existing_reservation_payment_locks', 'release_order_id');
        $hasGuestClaimColumn = $hasLocks && Schema::hasColumn('existing_reservation_payment_locks', 'guest_cancel_claimed_at');
        $hasClaims = $hasLocks && DB::table('existing_reservation_payment_locks')->where(function ($query) use ($hasGuestClaimColumn): void {
            $query->whereNotNull('release_order_id');
            if ($hasGuestClaimColumn) {
                $query->orWhereNotNull('guest_cancel_claimed_at');
            }
        })->exists();
        if (! $existingOrders()->exists() && ! $hasClaims) {
            return false;
        }
        if ($order === null || ! is_string($order->stays_reservation_id)) {
            return true;
        }
        $reference = $order->stays_reservation_id;
        $alias = null;
        if (Schema::hasTable('stays_reservation_aliases')) {
            $alias = DB::table('stays_reservation_aliases')
                ->where('canonical_id', strtolower($reference))->orWhere('reservation_code', $reference)->first();
        }
        $canonical = $alias?->canonical_id;
        if ($canonical === null && preg_match('/^[a-f0-9]{24}$/iD', $reference)) {
            $canonical = strtolower($reference);
        }
        if ($canonical === null) {
            // A legacy short code with no verified mapping may refer to any
            // existing order or release claim; absence cannot be inferred.
            return true;
        }
        if ($hasLocks && DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)->where(function ($query) use ($hasGuestClaimColumn): void {
            $query->whereNotNull('release_order_id');
            if ($hasGuestClaimColumn) {
                $query->orWhereNotNull('guest_cancel_claimed_at');
            }
        })->exists()) {
            return true;
        }
        $aliases = array_filter([$canonical, strtoupper($canonical), $alias?->reservation_code]);
        if ($existingOrders()->whereIn('stays_reservation_id', $aliases)->exists()) {
            return true;
        }
        if (! Schema::hasTable('stays_reservation_aliases')) {
            return $existingOrders()->exists();
        }

        // Old orders without a verified alias remain ambiguous after rollback.
        // The indexed EXISTS avoids loading the entire reservation history.
        return $existingOrders()->whereNotExists(function ($query): void {
            $query->selectRaw('1')->from('stays_reservation_aliases')
                ->whereRaw('stays_reservation_aliases.canonical_id = LOWER(direct_booking_orders.stays_reservation_id)');
        })->exists();
    }
}
