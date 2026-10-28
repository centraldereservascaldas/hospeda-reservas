<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DirectBookingOrderListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'status' => $this->status->value,
            'publicReference' => $this->public_reference,
            'reservationConfirmed' => $this->reservation_status === 'booked',
            'listingId' => $this->listing_id,
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
