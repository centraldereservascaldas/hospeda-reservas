<?php

namespace App\Http\Resources;

use App\Services\ExistingDepositVerificationStatus;
use App\Services\ExistingReservationContractEligibility;
use App\Services\ExistingReservationPaymentPlanPolicy;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DirectBookingOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $contractStatus = $this->origin === 'stays_existing'
            ? app(ExistingReservationPaymentPlanPolicy::class)->contractEvidenceStatus($this->resource)
            : null;

        return [
            'existingDepositReviewRequired' => $this->origin === 'stays_existing' && $this->status->value === 'entrada_conciliada' && app(ExistingDepositVerificationStatus::class)->requiresReview(is_array($this->operational_events) ? $this->operational_events : []),
            'status' => $this->status->value,
            'origin' => $this->origin,
            'existingContractRequired' => $contractStatus === 'missing',
            'existingContractAcceptable' => $contractStatus === 'missing' && app(ExistingReservationContractEligibility::class)->canAccept($this->resource),
            'existingContractReviewRequired' => $contractStatus === 'review',
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
