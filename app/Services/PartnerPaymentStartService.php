<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class PartnerPaymentStartService
{
    public function __construct(private readonly CieloEcommerceClient $cielo, private readonly CieloDirectConfiguration $configuration, private readonly ImobSysSearchClient $offers) {}

    public function start(string $id, ?string $paymentToken = null): array
    {
        if (! app()->environment(['local', 'testing']) || $this->configuration->environment() !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled')) {
            throw new RuntimeException('Pagamento de testes indisponível.');
        }
        $order = DB::transaction(function () use ($id, $paymentToken): PartnerCheckoutOrder {
            $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            if ($locked->status !== 'quoted') {
                throw new RuntimeException('Pedido já iniciado ou precisa de conferência.');
            }
            if ($locked->payment_method === 'card' && (! is_string($paymentToken) || ! preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/iD', $paymentToken))) {
                throw new RuntimeException('Token de cartão inválido.');
            }
            $locked->update(['status' => 'payment_starting']);

            return $locked;
        });
        $gatewayStarted = false;
        try {
            $offers = $this->offers->offers($order->check_in->format('Y-m-d'), $order->check_out->format('Y-m-d'), (int) $order->guests, '', $order->supplier_property_id, true);
            if (! is_array($offers) || count($offers) !== 1 || ($offers[0]['totalCents'] ?? null) !== (int) $order->base_cents || ($offers[0]['availabilityConfirmed'] ?? null) !== true || ($offers[0]['_crcnGuestCountVerified'] ?? null) !== true || ($offers[0]['additionalChargesKnown'] ?? null) !== true || ! is_int($offers[0]['_crcnExpiresAt'] ?? null) || $offers[0]['_crcnExpiresAt'] <= now()->timestamp) {
                throw new RuntimeException('Cotação mudou ou não pôde ser confirmada.');
            }
            $customer = $order->encrypted_customer;
            $amount = number_format(((int) $order->payment_cents) / 100, 2, '.', '');
            $gatewayStarted = true;
            $result = $order->payment_method === 'pix'
                ? $this->cielo->createPixPayment($order->merchant_order_id, $amount, 'BRL', $customer['fullName'], 1800, $customer['cpf'], 'CPF')
                : $this->cielo->createCardPayment((string) $paymentToken, $order->merchant_order_id, $amount, 'BRL', $customer['fullName'], $customer['cpf'], (int) $order->installments);
            $paymentId = data_get($result, 'Payment.PaymentId');
            if (! is_string($paymentId) || ! preg_match('/\A[0-9a-f-]{36}\z/iD', $paymentId)) {
                throw new RuntimeException('Pagamento requer conferência.');
            }
            $qr = $order->payment_method === 'pix' ? data_get($result, 'Payment.QrCodeString') : null;
            if ($order->payment_method === 'pix' && (! is_string($qr) || $qr === '')) {
                throw new RuntimeException('Código Pix requer conferência.');
            }
            DB::transaction(function () use ($id, $paymentId, $qr): void {
                $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
                if ($locked->status === 'attention_required' && $locked->attention_reason === 'payment_outcome_unknown' && $locked->payment_id === null) {
                    // A late response can arrive after the stale-request watchdog.
                    // Keep the ID for independent reconciliation; never return the
                    // unverified Pix code to the customer from this state.
                    $locked->update(['payment_id' => $paymentId]);
                    return;
                }
                if ($locked->status !== 'payment_starting') {
                    throw new RuntimeException('Pedido requer conferência.');
                }
                $locked->update(['status' => 'payment_pending', 'payment_id' => $paymentId, 'payment_qr_code' => $qr]);
            });

            if (PartnerCheckoutOrder::query()->whereKey($id)->where('status', 'attention_required')->exists()) {
                throw new RuntimeException('Pagamento requer conferência.');
            }

            return $result;
        } catch (Throwable $exception) {
            PartnerCheckoutOrder::query()->whereKey($id)->where('status', 'payment_starting')->update(['status' => $gatewayStarted ? 'attention_required' : 'quote_unavailable', 'attention_reason' => $gatewayStarted ? 'payment_outcome_unknown' : null]);
            throw $exception;
        }
    }
}
