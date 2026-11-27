<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PartnerManualReservationReview
{
    public function __construct(private readonly ImobSysPreReservationClient $supplier) {}

    /** Resolve a previously attempted reservation only after an administrator checks the supplier. */
    public function confirm(string $id, string $operator, array $observed): void
    {
        if (! app()->environment(['local', 'testing']) || config('services.cielo.direct_environment') !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled') || trim($operator) === '' || mb_strlen($operator) > 100) {
            throw new RuntimeException('Conferência indisponível.');
        }
        $snapshot = PartnerCheckoutOrder::query()->findOrFail($id);
        if ($snapshot->status !== 'attention_required' || $snapshot->attention_reason !== 'supplier_outcome_unknown' || ! $snapshot->payment_id) {
            throw new RuntimeException('Pedido não pode ser conferido.');
        }
        $supplier = $snapshot->supplier_operation_id ? $this->supplier->lookup($snapshot->supplier_operation_id) : $this->supplier->lookupByKey($snapshot->reservation_idempotency_key);
        $status = $supplier['partnerStatus'] ?? 'unknown';
        $payable = $supplier['supplierPayableObservedCents'] ?? null;
        if (! in_array($supplier['state'] ?? null, ['created', 'unknown'], true) || ! in_array($status, ['unknown', 'confirmed'], true)
            || ($supplier['propertyId'] ?? null) !== $snapshot->supplier_property_id || ($supplier['from'] ?? null) !== $snapshot->check_in->format('Y-m-d')
            || ($supplier['to'] ?? null) !== $snapshot->check_out->format('Y-m-d') || ($supplier['guests'] ?? null) !== (int) $snapshot->guests
            || (isset($supplier['amountCents']) && $supplier['amountCents'] !== (int) $snapshot->base_cents)
            || ($supplier['reservationReference'] ?? null) !== ($observed['reference'] ?? null)
            || ($payable !== null && (! is_int($payable) || $payable < 1 || ($snapshot->supplier_payable_observed_cents !== null && (int) $snapshot->supplier_payable_observed_cents !== $payable)))
            || ($supplier['propertyIdentityMatch'] ?? null) === false || ($supplier['stayDatesMatch'] ?? null) === false) {
            throw new RuntimeException('A operação do fornecedor precisa de conferência.');
        }
        foreach ([['propertyIdentityMatch', 'propertyIdentityObservedAt'], ['stayDatesMatch', 'stayDatesObservedAt']] as [$field, $timeField]) {
            if ((array_key_exists($field, $supplier) || array_key_exists($timeField, $supplier)) && (! is_bool($supplier[$field] ?? null) || ! is_string($supplier[$timeField] ?? null) || strtotime($supplier[$timeField]) === false || abs(now()->timestamp - strtotime($supplier[$timeField])) >= 60)) {
                throw new RuntimeException('Observação do fornecedor inválida.');
            }
        }
        if ($status === 'confirmed' && (! is_string($supplier['partnerStatusObservedAt'] ?? null) || strtotime($supplier['partnerStatusObservedAt']) === false || abs(now()->timestamp - strtotime($supplier['partnerStatusObservedAt'])) >= 60)) {
            throw new RuntimeException('Situação do fornecedor inválida.');
        }
        DB::transaction(function () use ($id, $operator, $observed, $snapshot, $payable): void {
            $order = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            $reference = $observed['reference'] ?? null;
            if ($order->status !== 'attention_required' || $order->attention_reason !== 'supplier_outcome_unknown' || ! $order->payment_id
                || $order->payment_id !== $snapshot->payment_id || $order->reservation_idempotency_key !== $snapshot->reservation_idempotency_key || $order->supplier_operation_id !== $snapshot->supplier_operation_id || $order->supplier_payable_observed_cents !== $snapshot->supplier_payable_observed_cents
                || $order->supplier_property_id !== $snapshot->supplier_property_id || $order->check_in->format('Y-m-d') !== $snapshot->check_in->format('Y-m-d') || $order->check_out->format('Y-m-d') !== $snapshot->check_out->format('Y-m-d') || (int) $order->guests !== (int) $snapshot->guests || (int) $order->base_cents !== (int) $snapshot->base_cents
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
            $order->update(['status' => 'awaiting_seller_payment', 'attention_reason' => null, 'reservation_reference' => $reference, 'supplier_payable_observed_cents' => $order->supplier_payable_observed_cents ?? $payable, 'supplier_reviewed_by' => trim($operator), 'supplier_reviewed_at' => now()]);
        });
    }
}
