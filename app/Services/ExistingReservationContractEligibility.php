<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;

class ExistingReservationContractEligibility
{
    public function canAccept(DirectBookingOrder $order, bool $lockAttempts = false): bool
    {
        if ($order->origin !== 'stays_existing' || $order->expires_at === null || ! $order->expires_at->isFuture()) {
            return false;
        }
        $attempts = $order->paymentAttempts()->when($lockAttempts, fn ($query) => $query->lockForUpdate())->get();
        $eligible = $order->status === DirectBookingOrderStatus::PreReservado
            && in_array($order->payment_status, [null, 'not_started'], true) && $attempts->isEmpty();
        if (! $eligible && $order->status === DirectBookingOrderStatus::PagamentoRecusado
            && in_array($order->payment_status, ['rejected', 'cancelled'], true) && $attempts->isNotEmpty()) {
            $eligible = $attempts->every(function ($attempt) use ($order): bool {
                return in_array($attempt->status, ['rejected', 'cancelled'], true)
                    && $attempt->gateway_status === $attempt->status && $attempt->paid_at === null
                    && is_string($attempt->gateway_payment_id) && $attempt->gateway_payment_id !== ''
                    && $attempt->gateway_provider === $order->gateway_provider
                    && is_string($order->gateway_merchant_id) && $order->gateway_merchant_id !== ''
                    && $attempt->gateway_merchant_id === $order->gateway_merchant_id
                    && DB::table('existing_reservation_payment_cycles')->where('direct_booking_order_id', $order->id)
                        ->where('direct_booking_payment_attempt_id', $attempt->id)->where('state', 'declined')
                        ->whereNull('active_reservation_id')->exists();
            });
        }

        return $eligible;
    }
}
