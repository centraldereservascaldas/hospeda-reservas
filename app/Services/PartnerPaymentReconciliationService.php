<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PartnerPaymentReconciliationService
{
    public function __construct(private readonly CieloEcommerceClient $cielo, private readonly CieloDirectConfiguration $configuration) {}

    public function reconcile(string $id): bool
    {
        if ($this->configuration->environment() !== 'sandbox' || ! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Conciliação do parceiro disponível apenas em sandbox.');
        }
        $order = PartnerCheckoutOrder::query()->findOrFail($id);
        $lateResponse = $order->status === 'attention_required' && $order->attention_reason === 'payment_outcome_unknown';
        if (($order->status !== 'payment_pending' && ! $lateResponse) || ! $order->payment_id) {
            return false;
        }
        $result = $this->cielo->findPaymentById($order->payment_id);
        $payment = $result['Payment'] ?? [];
        $attempt = $order->paymentAttempts()->where('gateway_payment_id', $order->payment_id)->first();
        $providerStatus = $payment['Status'] ?? null;
        if (($result['MerchantOrderId'] ?? null) !== $order->merchant_order_id || ($payment['PaymentId'] ?? null) !== $order->payment_id || ($payment['Amount'] ?? null) !== (int) $order->payment_cents || ($payment['Currency'] ?? null) !== 'BRL' || ($payment['Type'] ?? null) !== ($order->payment_method === 'pix' ? 'Pix' : 'CreditCard') || ($order->payment_method === 'card' && ($payment['Installments'] ?? null) !== (int) $order->installments)) {
            // A payment may already be captured: expose the discrepancy to operations,
            // and never issue a replacement charge or create a supplier reservation.
            DB::transaction(function () use ($id, $order, $attempt, $providerStatus): void {
                $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
                if ($locked->status === $order->status && $locked->attention_reason === $order->attention_reason && $locked->payment_id === $order->payment_id) {
                    $locked->update(['status' => 'attention_required', 'attention_reason' => 'payment_mismatch', 'payment_qr_code' => null]);
                }
                $attempt?->update(['status' => 'attention_required', 'provider_status' => is_scalar($providerStatus) ? (string) $providerStatus : null, 'error_code' => 'payment_mismatch', 'provider_updated_at' => now()]);
            });

            return false;
        }

        $gatewayStatus = $providerStatus;
        if (in_array($gatewayStatus, [3, 10, 11, 13], true)) {
            DB::transaction(function () use ($id, $order, $attempt, $gatewayStatus): void {
                $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
                if ($locked->status === $order->status && $locked->attention_reason === $order->attention_reason && $locked->payment_id === $order->payment_id) {
                    $locked->update(['status' => $gatewayStatus === 3 ? 'payment_rejected' : 'payment_cancelled', 'attention_reason' => null, 'payment_qr_code' => null]);
                }
                $attempt?->update(['status' => $gatewayStatus === 3 ? 'rejected' : 'cancelled', 'provider_status' => (string) $gatewayStatus, 'error_code' => null, 'provider_updated_at' => now()]);
            });

            return false;
        }
        if ($gatewayStatus !== 2) {
            $attempt?->update(['status' => 'pending', 'provider_status' => is_scalar($gatewayStatus) ? (string) $gatewayStatus : null, 'provider_updated_at' => now()]);

            return false;
        }

        // Status 2 can also include a requested or partial refund. Even a
        // pending refund makes the amount available for the booking uncertain.
        $refunds = $payment['Refunds'] ?? [];
        $voided = $payment['VoidedAmount'] ?? 0;
        if (! is_array($refunds) || count($refunds) > 0 || ! is_int($voided) || $voided !== 0) {
            DB::transaction(function () use ($id, $order, $attempt): void {
                $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
                if ($locked->status === $order->status && $locked->attention_reason === $order->attention_reason && $locked->payment_id === $order->payment_id) {
                    $locked->update(['status' => 'attention_required', 'attention_reason' => 'payment_refund_review', 'payment_qr_code' => null]);
                }
                $attempt?->update(['status' => 'attention_required', 'provider_status' => '2', 'error_code' => 'payment_refund_review', 'provider_updated_at' => now()]);
            });

            return false;
        }

        return DB::transaction(function () use ($order, $attempt): bool {
            $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($order->id);
            if (($locked->status !== 'payment_pending' && ! ($locked->status === 'attention_required' && $locked->attention_reason === 'payment_outcome_unknown')) || $locked->payment_id !== $order->payment_id || $locked->payment_cents !== $order->payment_cents || $locked->merchant_order_id !== $order->merchant_order_id) {
                return false;
            }
            $locked->update(['status' => 'payment_verified', 'attention_reason' => null, 'payment_qr_code' => null]);
            $attempt?->update(['status' => 'approved', 'provider_status' => '2', 'error_code' => null, 'paid_at' => $attempt->paid_at ?? now(), 'provider_updated_at' => now()]);

            return true;
        });
    }
}
