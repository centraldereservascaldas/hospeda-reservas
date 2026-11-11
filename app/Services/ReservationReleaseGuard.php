<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use Illuminate\Support\Facades\DB;

/** Call only while holding ExistingReservationPaymentLock for the canonical ID. */
class ReservationReleaseGuard
{
    public function paymentBlocked(string $canonical, ?string $code = null): bool
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Reservation lock is required.');
        }
        if (DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)->whereNotNull('release_order_id')->exists()) {
            return true;
        }
        $aliases = array_filter([$canonical, strtoupper($canonical), $code]);

        return DirectBookingStaysAction::query()->where('action_type', 'cancel_reservation')
            ->whereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', $aliases))->exists();
    }

    public function claim(DirectBookingOrder $order, array $identity): bool
    {
        $canonical = $identity['canonical'];
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Reservation lock is required.');
        }
        $row = DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)->first();
        if ($row === null || ($row->release_order_id !== null && $row->release_order_id !== $order->id)) {
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
        if ($blockingOrders || $blockingAttempts || $otherRelease) {
            return false;
        }
        DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $canonical)
            ->update(['release_order_id' => $order->id, 'updated_at' => now()]);

        return true;
    }
}
