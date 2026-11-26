<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PartnerUncertainPaymentRecovery
{
    public function __construct(private readonly CieloEcommerceClient $cielo, private readonly CieloDirectConfiguration $configuration) {}

    public function recover(string $id): bool
    {
        if (! app()->environment(['local', 'testing']) || $this->configuration->environment() !== 'sandbox') {
            throw new RuntimeException('Recuperação disponível apenas em sandbox.');
        }
        $order = PartnerCheckoutOrder::query()->findOrFail($id);
        if ($order->status !== 'attention_required' || $order->attention_reason !== 'payment_outcome_unknown' || $order->payment_id !== null) {
            return false;
        }
        $result = $this->cielo->findPaymentByMerchantOrderId($order->merchant_order_id);
        $payment = $result['Payment'] ?? [];
        $paymentId = $payment['PaymentId'] ?? null;
        if (($result['MerchantOrderId'] ?? null) !== $order->merchant_order_id || ! is_string($paymentId) || ! preg_match('/\A[0-9a-f-]{36}\z/iD', $paymentId) || ($payment['Amount'] ?? null) !== (int) $order->payment_cents || ($payment['Currency'] ?? null) !== 'BRL' || ($payment['Type'] ?? null) !== ($order->payment_method === 'pix' ? 'Pix' : 'CreditCard') || ($order->payment_method === 'card' && ($payment['Installments'] ?? null) !== (int) $order->installments)) {
            return false;
        }

        return DB::transaction(function () use ($id, $order, $paymentId, $payment): bool {
            $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            if ($locked->status !== 'attention_required' || $locked->attention_reason !== 'payment_outcome_unknown' || $locked->payment_id !== null || $locked->merchant_order_id !== $order->merchant_order_id || $locked->payment_cents !== $order->payment_cents) {
                return false;
            }
            $qr = $locked->payment_method === 'pix' && is_string($payment['QrCodeString'] ?? null) ? $payment['QrCodeString'] : null;
            $locked->update(['status' => 'payment_pending', 'attention_reason' => null, 'payment_id' => $paymentId, 'payment_qr_code' => $qr]);

            return true;
        });
    }
}
