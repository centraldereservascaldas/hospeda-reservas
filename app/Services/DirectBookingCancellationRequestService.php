<?php

namespace App\Services;

use App\Data\VerifiedGuest;
use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;

class DirectBookingCancellationRequestService
{
    /**
     * @return array{status: 'not_found'|'not_cancellable'|'already_requested'|'requested', receipt: array{protocol: string, requestedAt: string}|null}
     */
    public function request(string $publicReference, ?VerifiedGuest $guest, string $resumeToken): array
    {
        return DB::transaction(function () use ($publicReference, $guest, $resumeToken): array {
            $order = DirectBookingOrder::query()
                ->where('public_reference', $publicReference)
                ->lockForUpdate()
                ->first();

            $isAuthorizedGuest = $guest instanceof VerifiedGuest
                && hash_equals($order?->guest_email ?? '', mb_strtolower(trim($guest->email)));
            $isValidResumeToken = $order?->hasValidResumeToken($resumeToken) ?? false;
            if ($order === null || (! $isAuthorizedGuest && ! $isValidResumeToken)) {
                return ['status' => 'not_found', 'receipt' => null];
            }
            if ($order->status === DirectBookingOrderStatus::CancelamentoSolicitado) {
                return ['status' => 'already_requested', 'receipt' => $order->cancellationReceipt()];
            }
            if ($order->status !== DirectBookingOrderStatus::Confirmado || $order->payment_status !== 'approved') {
                return ['status' => 'not_cancellable', 'receipt' => null];
            }

            $order->transitionTo(DirectBookingOrderStatus::CancelamentoSolicitado, [
                'source' => 'guest_cancellation_request',
                'code' => 'guest_cancellation_requested',
                'requested_by' => $guest?->id,
            ]);
            $order->save();

            return ['status' => 'requested', 'receipt' => $order->cancellationReceipt()];
        });
    }
}
