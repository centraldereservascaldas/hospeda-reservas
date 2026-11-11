<?php

namespace App\Services;

use App\Models\DirectBookingPaymentAttempt;

/** Validates the captured card amounts using the rate recorded when the attempt was created. */
class ExistingReservationCardAmounts
{
    public function matches(DirectBookingPaymentAttempt $attempt, int $expectedBaseCents): bool
    {
        $rate = $attempt->processing_fee_basis_points;
        if ($attempt->payment_method !== 'card' || $attempt->currency !== 'BRL' || ! is_int($attempt->installments)
            || $attempt->installments < 1 || $attempt->installments > 6 || ! is_int($rate) || $rate < 0 || $rate >= 10000
            || $expectedBaseCents <= 0 || MoneyAmount::toCents($attempt->base_amount) !== $expectedBaseCents) {
            return false;
        }
        $divisor = 10000 - $rate;
        $total = intdiv(($expectedBaseCents * 10000) + $divisor - 1, $divisor);

        return MoneyAmount::toCents($attempt->amount) === $total
            && MoneyAmount::toCents($attempt->processing_fee_amount) === $total - $expectedBaseCents;
    }
}
