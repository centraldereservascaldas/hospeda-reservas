<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;

/** Sandbox orchestration; repeatable after a process restart before the supplier call. */
class PartnerCheckoutCompletionService
{
    public function __construct(
        private readonly PartnerPaymentReconciliationService $payments,
        private readonly PartnerPaidReservationService $reservations,
        private readonly PartnerUncertainPaymentRecovery $recovery,
    ) {}

    public function complete(string $id): string
    {
        $order = PartnerCheckoutOrder::query()->findOrFail($id);
        if ($order->status === 'attention_required' && $order->attention_reason === 'payment_outcome_unknown' && $order->payment_id === null) {
            $this->recovery->recover($id);
            $order->refresh();
        }
        if ($order->status === 'payment_pending' || ($order->status === 'attention_required' && $order->attention_reason === 'payment_outcome_unknown' && $order->payment_id !== null)) {
            $this->payments->reconcile($id);
            $order->refresh();
        }
        if ($order->status === 'payment_verified') {
            $this->reservations->create($id);
            $order->refresh();
        }

        return $order->status;
    }
}
