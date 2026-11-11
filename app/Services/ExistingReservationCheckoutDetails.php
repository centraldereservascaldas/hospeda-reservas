<?php

namespace App\Services;

/** Shared minimum data required before offering or creating a payment order. */
class ExistingReservationCheckoutDetails
{
    public function validGuests(array $reservation): bool
    {
        $details = $reservation['guestsDetails'] ?? null;
        if (! is_array($details)) {
            return false;
        }
        $total = 0;
        foreach (['adults', 'children', 'infants'] as $type) {
            $value = $details[$type] ?? null;
            if (! is_int($value) || $value < 0 || $value > 50) {
                return false;
            }
            $total += $value;
        }

        return is_int($reservation['guests'] ?? null) && $reservation['guests'] === $total;
    }

    public function validIdentity(array $reservation): bool
    {
        foreach (['_id', '_idclient', '_idlisting', 'checkInDate', 'checkOutDate'] as $field) {
            if (! is_string($reservation[$field] ?? null) || $reservation[$field] === '') {
                return false;
            }
        }

        return preg_match('/^[a-f0-9]{24}$/iD', $reservation['_id']) === 1
            && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $reservation['checkInDate']) === 1
            && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $reservation['checkOutDate']) === 1;
    }
}
