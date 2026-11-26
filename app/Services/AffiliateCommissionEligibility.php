<?php

namespace App\Services;

use Illuminate\Support\Carbon;

class AffiliateCommissionEligibility
{
    /** @return array{eligible: bool, reasons: array<int, string>, evidence: array<string, mixed>} */
    public function evaluate(?object $booking): array
    {
        if ($booking === null) {
            return [
                'eligible' => false,
                'reasons' => ['booking_not_found'],
                'evidence' => [],
            ];
        }

        $reasons = [];
        if ($booking->status !== 'concluido') {
            $reasons[] = 'stay_not_completed';
        }
        if (! is_string($booking->check_out) || Carbon::parse($booking->check_out)->startOfDay()->greaterThanOrEqualTo(now()->startOfDay())) {
            $reasons[] = 'checkout_not_elapsed';
        }
        if ($booking->payment_status !== 'approved') {
            $reasons[] = 'payment_not_approved';
        }
        if ($booking->reservation_status !== 'booked') {
            $reasons[] = 'reservation_not_booked';
        }

        return [
            'eligible' => $reasons === [],
            'reasons' => $reasons,
            'evidence' => [
                'booking_status' => $booking->status,
                'check_in' => $booking->check_in,
                'check_out' => $booking->check_out,
                'payment_status' => $booking->payment_status,
                'reservation_status' => $booking->reservation_status,
            ],
        ];
    }
}
