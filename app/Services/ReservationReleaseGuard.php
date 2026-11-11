<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Call only while holding ExistingReservationPaymentLock for the canonical ID. */
class ReservationReleaseGuard
{
    public function paymentBlocked(string $canonical, ?string $code = null): bool
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Reservation lock is required.');
        }
        if (! Schema::hasColumn('existing_reservation_payment_locks', 'guest_cancel_claimed_at')) {
            return true;
        }
        if (DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)->where(fn ($query) => $query->whereNotNull('release_order_id')->orWhereNotNull('guest_cancel_claimed_at'))->exists()) {
            return true;
        }
        $aliases = array_filter([$canonical, strtoupper($canonical), $code]);

        return DirectBookingStaysAction::query()->where('action_type', 'cancel_reservation')
            ->whereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', $aliases))->exists();
    }

    public function claimGuestCancellation(array $identity): bool
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Reservation lock is required.');
        }
        if (! Schema::hasColumn('existing_reservation_payment_locks', 'guest_cancel_claimed_at')) {
            return false;
        }
        $canonical = $identity['canonical'];
        $aliases = [$canonical, strtoupper($canonical), $identity['code']];
        $row = DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)->first();
        if ($row === null || $row->release_order_id !== null || $row->guest_cancel_claimed_at !== null
            || DirectBookingOrder::query()->whereIn('stays_reservation_id', $aliases)->exists()
            || $this->hasAmbiguousOrder($aliases)
            || DirectBookingPaymentAttempt::query()->where('stays_reservation_canonical_id', $canonical)->exists()) {
            return false;
        }
        DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)
            ->update(['guest_cancel_claimed_at' => now(), 'updated_at' => now()]);

        return true;
    }

    public function claim(DirectBookingOrder $order, array $identity): bool
    {
        $canonical = $identity['canonical'];
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Reservation lock is required.');
        }
        if (! Schema::hasColumn('existing_reservation_payment_locks', 'guest_cancel_claimed_at')) {
            return false;
        }
        $row = DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)->first();
        if ($row === null || $row->guest_cancel_claimed_at !== null || ($row->release_order_id !== null && $row->release_order_id !== $order->id)) {
            return false;
        }
        $aliases = [$canonical, strtoupper($canonical), $identity['code']];
        // An older order may contain payment history even when its local status
        // looks terminal. Require a manual review whenever ownership is shared.
        $blockingOrders = DirectBookingOrder::query()->whereKeyNot($order->id)->whereIn('stays_reservation_id', $aliases)->exists();
        $blockingAttempts = DirectBookingPaymentAttempt::query()
            ->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])
            ->where(fn ($query) => $query->where('stays_reservation_canonical_id', $canonical)
                ->orWhereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', $aliases)))
            ->exists();
        $otherRelease = DirectBookingStaysAction::query()->where('action_type', 'cancel_reservation')
            ->where('direct_booking_order_id', '!=', $order->id)
            ->whereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', $aliases))->exists();
        if ($blockingOrders || $blockingAttempts || $otherRelease || $this->hasAmbiguousOrder($aliases, $order->id)) {
            return false;
        }
        DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)
            ->update(['release_order_id' => $order->id, 'updated_at' => now()]);

        return true;
    }

    /** A legacy reference without a verified mapping could name any reservation. */
    public function hasAmbiguousOrder(array $knownAliases, ?string $exceptOrder = null): bool
    {
        $query = DirectBookingOrder::query()->whereNotNull('stays_reservation_id')
            ->whereNotIn('stays_reservation_id', $knownAliases);
        if ($exceptOrder !== null) {
            $query->whereKeyNot($exceptOrder);
        }
        if (Schema::hasTable('stays_reservation_aliases')) {
            $query->whereNotExists(function ($aliases): void {
                $aliases->selectRaw('1')->from('stays_reservation_aliases')
                    ->where(function ($match): void {
                        $match->whereRaw('stays_reservation_aliases.canonical_id = LOWER(direct_booking_orders.stays_reservation_id)')
                            ->orWhereColumn('stays_reservation_aliases.reservation_code', 'direct_booking_orders.stays_reservation_id');
                    });
            });
        }

        foreach ($query->cursor(['stays_reservation_id']) as $order) {
            if (! preg_match('/^[a-f0-9]{24}$/iD', $order->stays_reservation_id)) {
                return true;
            }
        }

        return false;
    }
}
