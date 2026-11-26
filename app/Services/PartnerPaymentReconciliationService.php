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
        if (($result['MerchantOrderId'] ?? null) !== $order->merchant_order_id || ($payment['PaymentId'] ?? null) !== $order->payment_id || ($payment['Amount'] ?? null) !== (int) $order->payment_cents || ($payment['Currency'] ?? null) !== 'BRL' || ($payment['Type'] ?? null) !== ($order->payment_method === 'pix' ? 'Pix' : 'CreditCard') || ($order->payment_method === 'card' && ($payment['Installments'] ?? null) !== (int) $order->installments)) {
            // A payment may already be captured: expose the discrepancy to operations,
            // and never issue a replacement charge or create a supplier reservation.
            PartnerCheckoutOrder::query()->whereKey($id)->where('status', $order->status)->where('attention_reason', $order->attention_reason)->where('payment_id', $order->payment_id)->update(['status' => 'attention_required', 'attention_reason' => 'payment_mismatch', 'payment_qr_code' => null]);

            return false;
        }

        $gatewayStatus = $payment['Status'] ?? null;
        if (in_array($gatewayStatus, [3, 10, 13], true)) {
            PartnerCheckoutOrder::query()->whereKey($id)->where('status', $order->status)->where('attention_reason', $order->attention_reason)->where('payment_id', $order->payment_id)->update(['status' => $gatewayStatus === 3 ? 'payment_rejected' : 'payment_cancelled', 'attention_reason' => null, 'payment_qr_code' => null]);

            return false;
        }
        if ($gatewayStatus !== 2) {
            return false;
        }

        return DB::transaction(function () use ($order): bool {
            $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($order->id);
            if (($locked->status !== 'payment_pending' && ! ($locked->status === 'attention_required' && $locked->attention_reason === 'payment_outcome_unknown')) || $locked->payment_id !== $order->payment_id || $locked->payment_cents !== $order->payment_cents || $locked->merchant_order_id !== $order->merchant_order_id) {
                return false;
            }
            $locked->update(['status' => 'payment_verified', 'attention_reason' => null, 'payment_qr_code' => null]);

            return true;
        });
    }
}
