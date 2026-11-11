<?php

namespace App\Services;

use App\Models\DirectBookingPaymentAttempt;
use App\Services\Payments\CieloCardPricing;
use InvalidArgumentException;

/** Validates the captured split; does not assert how Stays accounts for its fee. */
class ExistingReservationCardAmounts
{
    public function __construct(private readonly CieloCardPricing $pricing) {}

    public function matches(DirectBookingPaymentAttempt $attempt, int $expectedBaseCents): bool
    {
        if ($attempt->payment_method !== 'card' || $attempt->currency !== 'BRL' || ! is_int($attempt->installments)
            || $expectedBaseCents <= 0 || MoneyAmount::toCents($attempt->base_amount) !== $expectedBaseCents) {
            return false;
        }
        try {
            $expected = $this->pricing->calculate($attempt->base_amount, $attempt->installments);
        } catch (InvalidArgumentException) {
            return false;
        }

        return MoneyAmount::toCents($attempt->amount) === $expected['totalCents']
            && MoneyAmount::toCents($attempt->processing_fee_amount) === $expected['feeCents']
            && $attempt->processing_fee_basis_points === $expected['rateBasisPoints'];
    }
}
