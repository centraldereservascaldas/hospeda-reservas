<?php

namespace App\Services;

use App\Models\DirectBookingStaysAction;

/** An order-created receivable can only resume through its originating checkout. */
class ExistingReservationBootstrapOrigin
{
    /** @param list<mixed> $payments */
    public function requiresReview(mixed $reservationId, array $payments, mixed $paymentId): bool
    {
        if (! is_string($reservationId) || $reservationId === '' || ! is_string($paymentId) || $paymentId === '') {
            return true;
        }
        $matches = array_values(array_filter($payments, fn (mixed $p): bool => is_array($p) && ($p['_id'] ?? null) === $paymentId));
        if (count($matches) !== 1) {
            return true;
        }
        $description = $matches[0]['desc'] ?? null;
        if (is_string($description) && str_starts_with($description, 'CRCN_EXISTING_ORDER:')) {
            return true;
        }

        return DirectBookingStaysAction::query()
            ->where('action_type', 'experimental_create_receivable')
            ->whereHas('order', fn ($query) => $query->where('stays_reservation_id', $reservationId))
            ->where(fn ($query) => $query->where('external_id', $paymentId)
                ->orWhereIn('status', ['pending', 'processing', 'attention_required']))
            ->exists();
    }
}
