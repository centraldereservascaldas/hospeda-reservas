<?php

namespace App\Services;

use DateTimeImmutable;

/** A reviewed balance is bound to an immutable commercial snapshot and expiry. */
class ExistingReservationBalanceApproval
{
    /** @param array<string, mixed> $reservation
     * @return array<string, mixed>
     */
    public static function projection(array $reservation, mixed $balanceCents): array
    {
        return [
            '_id' => $reservation['_id'] ?? null,
            '_idclient' => $reservation['_idclient'] ?? null,
            '_idlisting' => $reservation['_idlisting'] ?? null,
            'checkInDate' => $reservation['checkInDate'] ?? null,
            'checkOutDate' => $reservation['checkOutDate'] ?? null,
            'guests' => $reservation['guests'] ?? null,
            'reservation_type' => $reservation['type'] ?? null,
            'partner_name' => is_string($reservation['partner']['name'] ?? null) ? mb_strtolower(trim($reservation['partner']['name'])) : null,
            'currency' => $reservation['price']['currency'] ?? null,
            'reservation_total_cents' => MoneyAmount::toCents($reservation['price']['_f_total'] ?? null),
            'pending_amount_cents' => $balanceCents,
        ];
    }

    /** @param array<string, mixed> $snapshot */
    public static function version(array $snapshot): ?string
    {
        $id = $snapshot['_id'] ?? null;
        if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id)) {
            return null;
        }
        $records = config('direct-booking.experimental_existing_approved_balances', []);
        $record = is_array($records) ? ($records[strtolower($id)] ?? null) : null;
        if (! is_array($record) || ! is_string($record['version'] ?? null)
            || ! preg_match('/^[A-Za-z0-9._~-]{1,64}$/D', $record['version'])
            || ! is_string($record['expires_at'] ?? null)) {
            return null;
        }
        $expires = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $record['expires_at']);
        if ($expires === false || $expires->format('Y-m-d\TH:i:sP') !== $record['expires_at'] || $expires->getTimestamp() <= now()->getTimestamp()) {
            return null;
        }
        foreach (['_idclient', '_idlisting', 'checkInDate', 'checkOutDate'] as $field) {
            if (! is_string($snapshot[$field] ?? null) || $snapshot[$field] === '' || ($record[$field] ?? null) !== $snapshot[$field]) {
                return null;
            }
        }
        foreach (['guests', 'reservation_total_cents', 'pending_amount_cents'] as $field) {
            if (! is_int($snapshot[$field] ?? null) || $snapshot[$field] <= 0 || ($record[$field] ?? null) !== $snapshot[$field]) {
                return null;
            }
        }
        if (! in_array($snapshot['reservation_type'] ?? null, ['reserved', 'booked'], true)
            || ($record['reservation_type'] ?? null) !== $snapshot['reservation_type']
            || ($snapshot['partner_name'] ?? null) !== 'api booking.com'
            || ($record['partner_name'] ?? null) !== $snapshot['partner_name']) {
            return null;
        }
        if (($snapshot['currency'] ?? null) !== 'BRL' || ($record['currency'] ?? null) !== 'BRL'
            || $snapshot['pending_amount_cents'] > $snapshot['reservation_total_cents']) {
            return null;
        }

        return $record['version'];
    }

    /** @param array<string, mixed> $snapshot */
    public static function approved(array $snapshot): bool
    {
        $version = self::version($snapshot);

        return is_string($version) && is_string($snapshot['approval_version'] ?? null)
            && hash_equals($version, $snapshot['approval_version']);
    }
}
