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
        $quotedListingId = is_array($order->quote_snapshot)
            ? ($order->quote_snapshot['_idlisting'] ?? null)
            : null;
        $listingIds = array_filter([$order->stays_listing_id, $quotedListingId], 'is_string');
        $checkIn = $order->check_in?->toDateString();
        $checkOut = $order->check_out?->toDateString();

        return $reservationId !== ''
            && ($order->stays_reservation_id === null || $reservationId === $order->stays_reservation_id)
            && $order->stays_client_id !== null
            && in_array((string) ($reservation['_idlisting'] ?? ''), $listingIds, true)
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
        return array_key_exists('currency', $price)
            && array_key_exists('_f_total', $price);
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

        if (array_key_exists('_f_total', $price)) {
            $expectedAmountCents = MoneyAmount::toCents($order->quote_total);
            $externalAmountCents = MoneyAmount::toCents($price['_f_total']);

            return $expectedAmountCents !== null && $externalAmountCents === $expectedAmountCents;
        }

        return true;
    }

    /** @param array<string, mixed> $reservation */
    public function matches(array $reservation, DirectBookingOrder $order): bool
    {
        return $this->matchesIdentity($reservation, $order)
            && $this->matchesCommercialDetails($reservation, $order);
    }
}
