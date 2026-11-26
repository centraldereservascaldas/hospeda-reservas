<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class PartnerManualPaymentService
{
    public function record(string $id, string $operator, int $amountCents, string $reference): void
    {
        if (! app()->environment(['local', 'testing']) || trim($operator) === '' || mb_strlen($operator) > 100 || $amountCents < 1 || trim($reference) === '' || mb_strlen($reference) > 100) {
            throw new RuntimeException('Registro de teste inválido.');
        }
        DB::transaction(function () use ($id, $operator, $amountCents, $reference): void {
            $order = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            if ($order->status !== 'awaiting_seller_payment' || ! $order->reservation_reference) {
                throw new RuntimeException('Pedido não aguarda pagamento manual.');
            }
            $order->update(['status' => 'supplier_payment_recorded', 'supplier_paid_cents' => $amountCents, 'supplier_payment_reference' => trim($reference), 'supplier_paid_by' => trim($operator), 'supplier_paid_at' => now()]);
        });
    }
}
