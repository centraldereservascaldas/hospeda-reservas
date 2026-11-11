<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;

/** Resolves reservation aliases before entering any database transaction. */
class StaysReservationIdentity
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    /** @return array{canonical: string, code: string}|null */
    public function resolve(string $reference): ?array
    {
        if (! preg_match('/^(?:[a-f0-9]{24}|[A-Z0-9]{5})$/iD', $reference)) {
            return null;
        }

        $reservation = $this->stays->get('/booking/reservations/'.rawurlencode($reference));

        $identity = $this->identityFromResponse($reference, $reservation);

        return $identity !== null && $this->remember($identity) ? $identity : null;
    }

    /** @return array{canonical: string, code: string}|null */
    public function resolveForLegacyOrder(DirectBookingOrder $order): ?array
    {
        $reference = $order->stays_reservation_id;
        if (! is_string($reference) || ! preg_match('/^(?:[a-f0-9]{24}|[A-Z0-9]{5})$/iD', $reference)) {
            return null;
        }
        $reservation = $this->stays->get('/booking/reservations/'.rawurlencode($reference));
        $identity = $this->identityFromResponse($reference, $reservation);
        if ($identity === null || ! is_array($reservation)) {
            return null;
        }
        $verifiedOrder = clone $order;
        $verifiedOrder->stays_reservation_id = $reservation['_id'];

        return app(DirectStaysReservationMatcher::class)->matchesIdentity($reservation, $verifiedOrder) && $this->remember($identity) ? $identity : null;
    }

    /** Persist only aliases read and validated from the Stays API; conflicts fail closed. */
    public function remember(array $identity): bool
    {
        $canonical = $identity['canonical'] ?? null;
        $code = $identity['code'] ?? null;
        if (! is_string($canonical) || ! preg_match('/^[a-f0-9]{24}$/D', $canonical)
            || ! is_string($code) || ! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return false;
        }
        DB::table('stays_reservation_aliases')->insertOrIgnore(['canonical_id' => $canonical, 'reservation_code' => $code, 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('stays_reservation_aliases')->where('canonical_id', $canonical)->where('reservation_code', $code)->exists();
    }

    /** @param array<string, mixed>|null $reservation
     * @return array{canonical: string, code: string}|null
     */
    private function identityFromResponse(string $reference, ?array $reservation): ?array
    {
        $canonical = $reservation['_id'] ?? null;
        $code = $reservation['id'] ?? null;
        if (! is_string($canonical) || ! preg_match('/^[a-f0-9]{24}$/iD', $canonical)
            || ! is_string($code) || ! preg_match('/^[A-Z0-9]{5}$/D', $code)
            || (strcasecmp($reference, $canonical) !== 0 && $reference !== $code)) {
            return null;
        }

        return ['canonical' => strtolower($canonical), 'code' => $code];
    }
}
