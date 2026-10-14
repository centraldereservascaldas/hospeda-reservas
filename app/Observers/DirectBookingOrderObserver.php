<?php

namespace App\Observers;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingEmail;
use App\Models\DirectBookingOrder;
use App\Services\DirectBookingEmailDispatcher;
use Illuminate\Support\Facades\DB;

class DirectBookingOrderObserver
{
    /**
     * Handle the DirectBookingOrder "updated" event.
     */
    public function updated(DirectBookingOrder $directBookingOrder): void
    {
        if (! $directBookingOrder->wasChanged('status')
            || $directBookingOrder->status !== DirectBookingOrderStatus::Confirmado
            || $directBookingOrder->payment_status !== 'approved'
            || $directBookingOrder->reservation_status !== 'booked'
            || $directBookingOrder->stays_reservation_id === null) {
            return;
        }

        $email = DirectBookingEmail::query()->firstOrCreate(
            [
                'direct_booking_order_id' => $directBookingOrder->id,
                'notification_type' => DirectBookingEmail::TYPE_BOOKING_CONFIRMED,
            ],
            ['status' => 'pending'],
        );

        DB::afterCommit(static function () use ($email): void {
            resolve(DirectBookingEmailDispatcher::class)->dispatch((string) $email->id, allowFreshPending: true);
        });
    }
}
