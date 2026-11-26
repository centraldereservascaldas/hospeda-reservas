<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PartnerManualReservationReview
{
    /** Resolve a previously attempted reservation only after an administrator checks the supplier. */
    public function confirm(string $id, string $operator, array $observed): void
    {
        if (! app()->environment(['local', 'testing']) || config('services.cielo.direct_environment') !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled') || trim($operator) === '' || mb_strlen($operator) > 100) {
            throw new RuntimeException('Conferência indisponível.');
        }
        DB::transaction(function () use ($id, $operator, $observed): void {
            $order = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            $reference = $observed['reference'] ?? null;
            if ($order->status !== 'attention_required' || $order->attention_reason !== 'supplier_outcome_unknown' || ! $order->payment_id
                || ! is_string($reference) || ! preg_match('/\A[1-9]\d{0,11}\z/D', $reference)
                || ($order->reservation_reference !== null && $order->reservation_reference !== $reference)
                || ($observed['propertyId'] ?? null) !== $order->supplier_property_id
                || ($observed['from'] ?? null) !== $order->check_in->format('Y-m-d')
                || ($observed['to'] ?? null) !== $order->check_out->format('Y-m-d')
                || ($observed['guests'] ?? null) !== (int) $order->guests
                || ($observed['baseCents'] ?? null) !== (int) $order->base_cents
                || ($observed['confirmed'] ?? null) !== true) {
                throw new RuntimeException('Dados da pré-reserva não conferem.');
            }
            $order->update(['status' => 'awaiting_seller_payment', 'attention_reason' => null, 'reservation_reference' => $reference, 'supplier_reviewed_by' => trim($operator), 'supplier_reviewed_at' => now()]);
        });
    }
}
