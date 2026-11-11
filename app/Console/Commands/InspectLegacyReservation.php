<?php

namespace App\Console\Commands;

use App\Models\DirectBookingOrder;
use App\Services\DirectStaysReservationMatcher;
use App\Services\StaysExternalApiClient;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

#[Signature('checkout:inspect-legacy-reservation {order : Internal order ID}')]
#[Description('Read-only inspection of one legacy order using one Stays GET')]
class InspectLegacyReservation extends Command
{
    public function handle(StaysExternalApiClient $stays, DirectStaysReservationMatcher $matcher): int
    {
        $order = DirectBookingOrder::query()->find($this->argument('order'));
        if (! $order || ! is_string($order->stays_reservation_id)
            || ! preg_match('/^[A-Z0-9]{5}$/D', $order->stays_reservation_id)) {
            $this->line(json_encode(['eligible_orders' => 0], JSON_THROW_ON_ERROR));

            return self::FAILURE;
        }

        $reference = $order->stays_reservation_id;
        $reservation = $stays->get('/booking/reservations/'.rawurlencode($reference));
        if ($reservation === null) {
            $this->line(json_encode(['eligible_orders' => 1, 'status' => 'inconclusive'], JSON_THROW_ON_ERROR));

            return self::FAILURE;
        }
        $canonical = $reservation['_id'] ?? null;
        $code = $reservation['id'] ?? null;
        $valid = is_string($canonical) && preg_match('/^[a-f0-9]{24}$/iD', $canonical)
            && is_string($code) && preg_match('/^[A-Z0-9]{5}$/D', $code) && $code === $reference;
        $matches = false;
        $conflicts = null;
        if ($valid) {
            $verifiedOrder = clone $order;
            $verifiedOrder->stays_reservation_id = $canonical;
            $matches = $matcher->matchesIdentity($reservation, $verifiedOrder);
            if (Schema::hasTable('stays_reservation_aliases')) {
                $conflicts = DB::table('stays_reservation_aliases')
                    ->where('canonical_id', strtolower($canonical))->orWhere('reservation_code', $code)
                    ->get(['canonical_id', 'reservation_code'])
                    ->filter(fn ($row): bool => $row->canonical_id !== strtolower($canonical) || $row->reservation_code !== $code)
                    ->count();
            }
        }

        $this->line(json_encode([
            'eligible_orders' => 1,
            'response_identity_valid' => (bool) $valid,
            'order_identity_matches' => $matches,
            'alias_conflicts' => $conflicts,
        ], JSON_THROW_ON_ERROR));

        return self::SUCCESS;
    }
}
