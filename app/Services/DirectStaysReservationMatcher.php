<?php

namespace App\Services;

use App\Models\DirectBookingOrder;

class DirectStaysReservationMatcher
{
    /** @param array<string, mixed> $reservation */
    public function matchesIdentity(array $reservation, DirectBookingOrder $order): bool
    {
        $reservationId = (string) ($reservation['_id'] ?? $reservation['id'] ?? '');
        $guests = is_array($order->guests) ? $order->guests : [];
        $checkIn = $order->check_in?->toDateString();
        $checkOut = $order->check_out?->toDateString();

        return $reservationId !== ''
            && ($order->stays_reservation_id === null || $reservationId === $order->stays_reservation_id)
            && $order->stays_client_id !== null
            && (string) ($reservation['_idlisting'] ?? '') === (string) $order->stays_listing_id
            && (string) ($reservation['_idclient'] ?? '') === (string) $order->stays_client_id
            && $checkIn !== null
            && (string) ($reservation['checkInDate'] ?? '') === $checkIn
            && $checkOut !== null
            && (string) ($reservation['checkOutDate'] ?? '') === $checkOut
            && hash_equals('CRCN_DIRECT_ORDER:'.$order->id, (string) ($reservation['internalNote'] ?? ''));
    }

    /** @param array<string, mixed> $reservation */
    public function matchesCommercialDetails(array $reservation, DirectBookingOrder $order): bool
    {
        if (! $this->matchesProvidedCommercialDetails($reservation, $order)
            || ! array_key_exists('guests', $reservation)
            || ! is_array($reservation['price'] ?? null)) {
            return false;
        }

        $price = $reservation['price'];
        $hostingDetails = is_array($price['hostingDetails'] ?? null) ? $price['hostingDetails'] : [];
        $hasCurrency = array_key_exists('currency', $price) || array_key_exists('currency', $hostingDetails);
        $hasAmount = collect([
            [$price, '_f_total'],
            [$price, '_f_expected'],
            [$hostingDetails, '_f_total'],
            [$hostingDetails, '_f_expected'],
        ])->contains(fn (array $field): bool => array_key_exists($field[1], $field[0]));

        return $hasCurrency && $hasAmount;
    }

    /** @param array<string, mixed> $reservation */
    public function matchesProvidedCommercialDetails(array $reservation, DirectBookingOrder $order): bool
    {
        $guests = is_array($order->guests) ? $order->guests : [];
        foreach (['adults', 'children', 'infants'] as $guestType) {
            if (! isset($guests[$guestType]) || ! is_numeric($guests[$guestType]) || (int) $guests[$guestType] < 0) {
                return false;
            }
        }

        $expectedGuests = (int) $guests['adults'] + (int) $guests['children'] + (int) $guests['infants'];
        if (array_key_exists('guests', $reservation)
            && (! is_numeric($reservation['guests']) || (int) $reservation['guests'] !== $expectedGuests)) {
            return false;
        }

        if (array_key_exists('guestsDetails', $reservation)) {
            $guestDetails = $reservation['guestsDetails'];
            if (! is_array($guestDetails)) {
                return false;
            }

            foreach (['adults', 'children', 'infants'] as $guestType) {
                if (array_key_exists($guestType, $guestDetails)
                    && (! is_numeric($guestDetails[$guestType]) || (int) $guestDetails[$guestType] !== (int) $guests[$guestType])) {
                    return false;
                }
            }
        }

        if (! array_key_exists('price', $reservation)) {
            return true;
        }

        $price = $reservation['price'];
        if (! is_array($price)) {
            return false;
        }

        if (array_key_exists('hostingDetails', $price) && ! is_array($price['hostingDetails'])) {
            return false;
        }
        $hostingDetails = is_array($price['hostingDetails'] ?? null) ? $price['hostingDetails'] : [];

        foreach ([[$price, 'currency'], [$hostingDetails, 'currency']] as [$details, $key]) {
            if (array_key_exists($key, $details)
                && (! is_string($details[$key]) || $details[$key] !== $order->currency)) {
                return false;
            }
        }

        $hasAmount = false;
        $expectedAmountCents = null;
        foreach ([[$price, '_f_total'], [$price, '_f_expected'], [$hostingDetails, '_f_total'], [$hostingDetails, '_f_expected']] as [$details, $key]) {
            if (! array_key_exists($key, $details)) {
                continue;
            }

            $hasAmount = true;
            $expectedAmountCents ??= MoneyAmount::toCents($order->quote_total);
            $externalAmountCents = MoneyAmount::toCents($details[$key]);
            if ($expectedAmountCents === null || $externalAmountCents !== $expectedAmountCents) {
                return false;
            }
        }

        return ! $hasAmount || $expectedAmountCents !== null;
    }

    /** @param array<string, mixed> $reservation */
    public function matches(array $reservation, DirectBookingOrder $order): bool
    {
        return $this->matchesIdentity($reservation, $order)
            && $this->matchesCommercialDetails($reservation, $order);
    }
}
