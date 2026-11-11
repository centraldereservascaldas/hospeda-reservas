<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DirectBookingOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'status' => $this->status->value,
            'origin' => $this->origin,
            'publicReference' => $this->public_reference,
            'reservationConfirmed' => $this->reservation_status === 'booked',
            'listingId' => $this->listing_id,
            'guestName' => $this->guest_name,
            'from' => $this->check_in->toDateString(),
            'to' => $this->check_out->toDateString(),
            'quoteTotal' => $this->quote_total,
            'currency' => $this->currency,
            'paymentStatus' => $this->payment_status,
            'expiresAt' => $this->expires_at?->toISOString(),
            'createdAt' => $this->created_at?->toISOString(),
            'cancellationReceipt' => $this->cancellationReceipt(),
        ];
    }
}
