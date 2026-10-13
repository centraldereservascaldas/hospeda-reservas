<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DirectBookingOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status->value,
            'publicReference' => $this->public_reference,
            'reservationStatus' => $this->reservation_status,
            'listingId' => $this->listing_id,
            'from' => $this->check_in->toDateString(),
            'to' => $this->check_out->toDateString(),
            'quoteTotal' => $this->quote_total,
            'currency' => $this->currency,
            'expiresAt' => $this->expires_at?->toISOString(),
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
