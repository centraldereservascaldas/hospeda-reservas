<?php

namespace App\Services;

use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;

/** Experimental, explicitly invoked evidence capture; it does not change reservations. */
class ExperimentalLegacyReservationEvidence
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly DirectStaysReservationMatcher $matcher,
        private readonly ExistingReservationPaymentLock $lock,
    ) {}

    /** Capture immutable evidence for one website order, or fail closed. */
    public function capture(string $orderId): bool
    {
        $candidate = $this->candidate($orderId);
        if ($candidate === null) {
            return false;
        }
        [$snapshot, $account, $reference, $canonical] = $candidate;

        return $this->lock->synchronized($canonical, function () use ($orderId, $snapshot, $account, $reference, $canonical): bool {
            $current = DirectBookingOrder::query()->lockForUpdate()->find($orderId);
            if (! $current || $this->accountFingerprint() !== $account || $this->snapshot($current) !== $snapshot) {
                return false;
            }
            DB::table('legacy_reservation_order_evidence')->insertOrIgnore([
                'direct_booking_order_id' => $orderId,
                'reservation_reference' => $reference,
                'canonical_id' => $canonical,
                'account_fingerprint' => $account,
                'order_snapshot_hash' => $snapshot,
                'created_at' => now(),
            ]);
            $existing = DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $orderId)->first();

            return $existing !== null && $existing->reservation_reference === $reference
                && $existing->canonical_id === $canonical && $existing->account_fingerprint === $account
                && $existing->order_snapshot_hash === $snapshot;
        });
    }

    /** Preliminary remote identity check; no evidence or lock is written. */
    public function preview(string $orderId): bool
    {
        return $this->candidate($orderId) !== null;
    }

    /** @return array{string, string, string, string}|null */
    private function candidate(string $orderId): ?array
    {
        if (DB::transactionLevel() !== 0 || ($account = $this->accountFingerprint()) === null) {
            return null;
        }
        $order = DirectBookingOrder::query()->find($orderId);
        if (! $order || $order->origin !== 'website' || ! is_string($order->stays_reservation_id)
            || ! preg_match('/^[A-Z0-9]{5}$/D', $order->stays_reservation_id)) {
            return null;
        }
        $snapshot = $this->snapshot($order);
        $reference = $order->stays_reservation_id;
        $reservation = $this->stays->get('/booking/reservations/'.rawurlencode($reference));
        $canonical = $reservation['_id'] ?? null;
        if (! is_array($reservation) || ! is_string($canonical) || ! preg_match('/^[a-f0-9]{24}$/iD', $canonical)
            || ($reservation['id'] ?? null) !== $reference) {
            return null;
        }
        $verified = clone $order;
        $verified->stays_reservation_id = $canonical;
        if (! $this->matcher->matchesIdentity($reservation, $verified)) {
            return null;
        }

        return [$snapshot, $account, $reference, strtolower($canonical)];
    }

    public function accountFingerprint(): ?string
    {
        $url = config('services.stays.base_url');
        $client = config('services.stays.client_id');
        if (! is_string($url) || trim($url) === '' || ! is_string($client) || trim($client) === '' || ! $this->stays->isConfigured()) {
            return null;
        }

        return hash('sha256', json_encode([rtrim($url, '/'), $client], JSON_THROW_ON_ERROR));
    }

    public function snapshot(DirectBookingOrder $order): string
    {
        $fields = ['id', 'origin', 'stays_reservation_id', 'stays_listing_id', 'stays_client_id', 'check_in', 'check_out', 'quote_snapshot'];
        $values = [];
        foreach ($fields as $field) {
            $values[$field] = $order->getRawOriginal($field);
        }

        return hash('sha256', json_encode($values, JSON_THROW_ON_ERROR));
    }
}
