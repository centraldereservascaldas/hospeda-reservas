<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class PartnerPaidReservationService
{
    public function __construct(private readonly ImobSysPreReservationClient $supplier) {}

    /** The calling payment handler must independently verify and persist the captured payment. */
    public function create(string $id): void
    {
        if (! app()->environment(['local', 'testing']) || config('services.cielo.direct_environment') !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled')) {
            throw new RuntimeException('Pré-reserva experimental disponível apenas em sandbox.');
        }

        $claimed = DB::transaction(function () use ($id): ?PartnerCheckoutOrder {
            $order = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            if ($order->status === 'awaiting_seller_payment') {
                return null;
            }
            if ($order->status !== 'payment_verified' || ! $order->payment_id || $order->currency !== 'BRL') {
                throw new RuntimeException('Pagamento precisa de conferência.');
            }
            $order->update(['status' => 'reservation_starting']);

            return $order;
        });
        if ($claimed === null) {
            return;
        }

        try {
            $result = $this->supplier->create([
                'propertyId' => $claimed->supplier_property_id,
                'from' => $claimed->check_in->format('Y-m-d'),
                'to' => $claimed->check_out->format('Y-m-d'),
                'guests' => (int) $claimed->guests,
                'acceptedTotalCents' => (int) $claimed->base_cents,
                'customer' => $claimed->encrypted_customer,
            ], $claimed->reservation_idempotency_key, function (string $operationId) use ($id): void {
                PartnerCheckoutOrder::query()->whereKey($id)->whereIn('status', ['reservation_starting', 'attention_required'])->update(['supplier_operation_id' => $operationId]);
            });
            $updated = PartnerCheckoutOrder::query()->whereKey($id)->where('status', 'reservation_starting')->update(['status' => 'awaiting_seller_payment', 'reservation_reference' => $result['id'], 'supplier_payable_observed_cents' => $result['supplierPayableObservedCents'] ?? null]);
            if ($updated === 0) {
                // Recovery may have marked a slow request uncertain while it was
                // still running. Preserve the validated response for review, but
                // do not override the operational state or start another request.
                PartnerCheckoutOrder::query()->whereKey($id)->where('status', 'attention_required')
                    ->where('attention_reason', 'supplier_outcome_unknown')->whereNull('reservation_reference')
                    ->update(['reservation_reference' => $result['id'], 'supplier_payable_observed_cents' => $result['supplierPayableObservedCents'] ?? null]);
            }
        } catch (Throwable $exception) {
            PartnerCheckoutOrder::query()->whereKey($id)->where('status', 'reservation_starting')->update(['status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown']);
            throw $exception;
        }
    }
}
