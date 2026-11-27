<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use App\Models\PartnerPaymentAttempt;
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
        $attempt = DB::transaction(function () use ($id, $paymentToken): PartnerPaymentAttempt {
            $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
            if ($locked->status !== 'quoted') {
                throw new RuntimeException('Pedido já iniciado ou precisa de conferência.');
            }
            if ($locked->payment_method === 'card' && (! is_string($paymentToken) || ! preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/iD', $paymentToken))) {
                throw new RuntimeException('Token de cartão inválido.');
            }
            $locked->update(['status' => 'payment_starting']);

            return $locked->paymentAttempts()->create([
                'supplier_property_id' => $locked->supplier_property_id,
                'gateway_provider' => $this->configuration->provider(),
                'merchant_order_id' => $locked->merchant_order_id,
                'payment_method' => $locked->payment_method,
                'installments' => $locked->installments,
                'amount_cents' => $locked->payment_cents,
                'currency' => $locked->currency,
                'status' => 'starting',
                'submitted_at' => now(),
            ]);
        });
        $order = $attempt->partnerCheckoutOrder()->firstOrFail();
        $gatewayStarted = false;
        try {
            $offers = $this->offers->offers($order->check_in->format('Y-m-d'), $order->check_out->format('Y-m-d'), (int) $order->guests, '', $order->supplier_property_id, true);
            if (! is_array($offers) || count($offers) !== 1 || ($offers[0]['totalCents'] ?? null) !== (int) $order->base_cents || ($offers[0]['availabilityConfirmed'] ?? null) !== true || ($offers[0]['_crcnGuestCountVerified'] ?? null) !== true || ($offers[0]['additionalChargesKnown'] ?? null) !== true || ! is_int($offers[0]['_crcnExpiresAt'] ?? null) || $offers[0]['_crcnExpiresAt'] <= now()->timestamp) {
                throw new RuntimeException('Cotação mudou ou não pôde ser confirmada.');
            }
            if ($order->payment_method === 'pix' && ! $order->hasCurrentPixWindow()) {
                throw new RuntimeException('Pedido expirado; faça uma nova cotação.');
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
            if ($order->payment_method === 'pix' && ((! is_string($qr) || $qr === '') || data_get($result, 'Payment.Status') !== 12)) {
                throw new RuntimeException('Código Pix requer conferência.');
            }
            DB::transaction(function () use ($id, $paymentId, $qr, $attempt, $result): void {
                $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
                if ($locked->status === 'attention_required' && $locked->attention_reason === 'payment_outcome_unknown' && $locked->payment_id === null) {
                    // A late response can arrive after the stale-request watchdog.
                    // Keep the ID for independent reconciliation; never return the
                    // unverified Pix code to the customer from this state.
                    $locked->update(['payment_id' => $paymentId]);
                    $attempt->update([
                        'gateway_payment_id' => $paymentId,
                        'provider_status' => (string) data_get($result, 'Payment.Status', ''),
                        'status' => 'attention_required',
                        'error_code' => 'late_gateway_response_requires_reconciliation',
                    ]);

                    return;
                }
                if ($locked->status !== 'payment_starting') {
                    throw new RuntimeException('Pedido requer conferência.');
                }
                $locked->update(['status' => 'payment_pending', 'payment_id' => $paymentId, 'payment_qr_code' => $qr]);
                $attempt->update([
                    'gateway_payment_id' => $paymentId,
                    'provider_status' => (string) data_get($result, 'Payment.Status', ''),
                    'provider_status_detail' => is_string(data_get($result, 'Payment.ReturnCode')) ? mb_substr((string) data_get($result, 'Payment.ReturnCode'), 0, 100) : null,
                    'status' => 'pending',
                    'expires_at' => $locked->payment_method === 'pix' ? now()->addSeconds(1800) : null,
                ]);
            });

            if (PartnerCheckoutOrder::query()->whereKey($id)->where('status', 'attention_required')->exists()) {
                throw new RuntimeException('Pagamento requer conferência.');
            }

            return $result;
        } catch (Throwable $exception) {
            DB::transaction(function () use ($id, $gatewayStarted, $attempt): void {
                $locked = PartnerCheckoutOrder::query()->lockForUpdate()->findOrFail($id);
                if ($locked->status === 'payment_starting') {
                    $locked->update(['status' => $gatewayStarted ? 'attention_required' : 'quote_unavailable', 'attention_reason' => $gatewayStarted ? 'payment_outcome_unknown' : null]);
                }
                $attempt->update([
                    'status' => $gatewayStarted ? 'attention_required' : 'failed',
                    'error_code' => $gatewayStarted ? 'payment_outcome_unknown' : 'quote_unavailable',
                ]);
            });
            throw $exception;
        }
    }
}
