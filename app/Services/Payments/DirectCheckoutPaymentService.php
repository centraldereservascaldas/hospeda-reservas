<?php

namespace App\Services\Payments;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Requests\StoreCheckoutPaymentRequest;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

class DirectCheckoutPaymentService
{
    public function __construct(private readonly MercadoPagoClient $mercadoPago) {}

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function createAttempt(DirectBookingOrder $order, StoreCheckoutPaymentRequest $request): array
    {
        if (! config('direct-booking.enabled', false) || ! config('direct-booking.payments_enabled', false)) {
            return $this->result(null, 'payments_disabled', 'O pagamento no site ainda não está habilitado.', 503);
        }

        $input = $request->validated();
        $idempotencyKey = $input['idempotencyKey'];
        $fingerprint = $this->requestFingerprint($input);
        $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existingAttempt !== null) {
            return $this->replay($existingAttempt, $order, $fingerprint);
        }

        try {
            $attempt = DB::transaction(function () use ($order, $input, $idempotencyKey, $fingerprint): DirectBookingPaymentAttempt|array {
                $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
                $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
                if ($existingAttempt !== null) {
                    return ['existing' => $existingAttempt];
                }

                if (! in_array($lockedOrder->status, [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::PagamentoRecusado], true)
                    || $lockedOrder->stays_reservation_id === null
                    || $lockedOrder->reservation_status !== 'reserved'
                    || $lockedOrder->expires_at === null
                    || $lockedOrder->expires_at->lessThanOrEqualTo(now())) {
                    return ['error' => 'order_not_payable'];
                }

                $activeAttemptExists = DirectBookingPaymentAttempt::query()
                    ->where('direct_booking_order_id', $lockedOrder->id)
                    ->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])
                    ->exists();
                if ($activeAttemptExists) {
                    return ['error' => 'payment_attempt_in_progress'];
                }

                if ($input['paymentMethod'] === 'pix') {
                    $minimumMinutes = (int) config('direct-booking.pix_minimum_remaining_minutes', 30);
                    $safetyMarginMinutes = (int) config('direct-booking.payment_safety_margin_minutes', 5);
                    if ($lockedOrder->expires_at->lessThan(now()->addMinutes($minimumMinutes + $safetyMarginMinutes))) {
                        return ['error' => 'reservation_expires_too_soon'];
                    }
                }

                $attempt = DirectBookingPaymentAttempt::query()->create([
                    'direct_booking_order_id' => $lockedOrder->id,
                    'idempotency_key' => $idempotencyKey,
                    'request_fingerprint' => $fingerprint,
                    'payment_method' => $input['paymentMethod'],
                    'payment_method_id' => $input['paymentMethodId'],
                    'installments' => $input['installments'] ?? null,
                    'status' => 'processing',
                    'amount' => $lockedOrder->quote_total,
                    'currency' => $lockedOrder->currency,
                ]);

                if ($lockedOrder->status !== DirectBookingOrderStatus::PagamentoPendente) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoPendente, ['source' => 'payment_attempt_started']);
                }
                $lockedOrder->payment_status = 'pending';
                $lockedOrder->payment_amount = $lockedOrder->quote_total;
                $lockedOrder->payment_currency = $lockedOrder->currency;
                $lockedOrder->payment_method = $input['paymentMethod'];
                $lockedOrder->payment_expires_at = $lockedOrder->expires_at;
                $lockedOrder->save();

                return $attempt;
            });
        } catch (UniqueConstraintViolationException) {
            $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
            if ($existingAttempt !== null) {
                return $this->replay($existingAttempt, $order, $fingerprint);
            }

            return $this->result(null, 'payment_attempt_conflict', 'Não foi possível registrar a tentativa de pagamento.', 409);
        }

        if (is_array($attempt) && isset($attempt['existing'])) {
            return $this->replay($attempt['existing'], $order, $fingerprint);
        }

        if (is_array($attempt)) {
            return match ($attempt['error']) {
                'reservation_expires_too_soon' => $this->result(null, $attempt['error'], 'A retenção da reserva é curta demais para iniciar um Pix com segurança. Nenhuma cobrança foi iniciada.', 409),
                'payment_attempt_in_progress' => $this->result(null, $attempt['error'], 'Já existe uma tentativa de pagamento pendente para este pedido.', 409),
                default => $this->result(null, 'order_not_payable', 'Este pedido não está em estado válido para receber um pagamento.', 409),
            };
        }

        $order->refresh();

        $methodData = ['payment_method_id' => $input['paymentMethodId']];
        if ($input['paymentMethod'] === 'card') {
            $methodData['token'] = $input['token'];
            $methodData['installments'] = (int) $input['installments'];
            if (isset($input['issuerId'])) {
                $methodData['issuer_id'] = (int) $input['issuerId'];
            }
        }

        $payer = ['email' => $order->guest_email];
        if (isset($input['payerIdentification'])) {
            $payer['identification'] = $input['payerIdentification'];
        }
        $additionalData = [
            'description' => 'Reserva CRCN '.$order->listing_id,
            'payer' => $payer,
        ];
        if ($input['paymentMethod'] === 'pix') {
            $additionalData['date_of_expiration'] = $order->expires_at->toIso8601String();
        }

        try {
            $createdPayment = $this->mercadoPago->createPayment(
                (string) $order->quote_total,
                $order->id,
                $attempt->id,
                $methodData,
                $additionalData,
            );
            $gatewayId = $createdPayment['id'] ?? null;
            if (! is_string($gatewayId) && ! is_int($gatewayId)) {
                throw new \RuntimeException('Mercado Pago did not return a payment identifier.');
            }
            $attempt->forceFill(['gateway_payment_id' => (string) $gatewayId])->save();
            $gatewayPayment = $this->mercadoPago->getPayment($gatewayId);
        } catch (Throwable) {
            $attempt->forceFill([
                'status' => 'unknown',
                'error_code' => 'gateway_result_unknown',
                'gateway_payment_id' => isset($gatewayId) && (is_string($gatewayId) || is_int($gatewayId)) ? (string) $gatewayId : null,
            ])->save();
            $this->markOrderForAttention($order, 'gateway_result_unknown');

            return $this->result($attempt->refresh(), 'gateway_result_unknown', 'O resultado da solicitação ao gateway é incerto. A tentativa não será repetida automaticamente.', 503);
        }

        return $this->applyGatewayPayment($order, $attempt, $gatewayPayment);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function reconcileGatewayPayment(string $gatewayPaymentId): array
    {
        $gatewayPayment = $this->mercadoPago->getPayment($gatewayPaymentId);
        $attempt = DirectBookingPaymentAttempt::query()
            ->where('gateway_payment_id', $gatewayPaymentId)
            ->first();

        if ($attempt === null) {
            throw new \RuntimeException('The payment notification does not match a persisted payment attempt yet.');
        }

        return $this->applyGatewayPayment($attempt->order, $attempt, $gatewayPayment);
    }

    /** @param array<string, mixed> $gatewayPayment
     * @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool}
     */
    private function applyGatewayPayment(DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt, array $gatewayPayment): array
    {
        $gatewayId = $gatewayPayment['id'] ?? null;
        $status = $gatewayPayment['status'] ?? null;
        $amount = $gatewayPayment['transaction_amount'] ?? null;
        $currency = $gatewayPayment['currency_id'] ?? null;
        $externalReference = $gatewayPayment['external_reference'] ?? null;
        if ((! is_string($gatewayId) && ! is_int($gatewayId))
            || ! is_string($status)
            || ! is_numeric($amount)
            || ! is_finite((float) $amount)
            || (int) round(((float) $amount) * 100) !== (int) round(((float) $order->quote_total) * 100)
            || $currency !== $order->currency
            || $externalReference !== $order->id) {
            $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_payment_mismatch'])->save();
            $this->markOrderForAttention($order, 'gateway_payment_mismatch');

            return $this->result($attempt->refresh(), 'gateway_payment_mismatch', 'O gateway retornou dados que não correspondem ao pedido. A confirmação foi interrompida.', 503);
        }

        $transactionData = data_get($gatewayPayment, 'point_of_interaction.transaction_data', []);
        $expiresAt = $this->parseDate($gatewayPayment['date_of_expiration'] ?? null) ?? $order->expires_at;
        $paidAt = $status === 'approved' ? ($this->parseDate($gatewayPayment['date_approved'] ?? null) ?? now()) : null;
        $gatewayUpdatedAt = $this->parseDate($gatewayPayment['date_last_updated'] ?? null);
        $attemptStatus = match ($status) {
            'approved' => 'approved',
            'pending' => 'pending',
            'in_process' => 'in_process',
            'rejected' => 'rejected',
            'cancelled' => 'cancelled',
            'refunded', 'charged_back' => 'attention_required',
            default => 'unknown',
        };

        DB::transaction(function () use ($order, $attempt, $gatewayPayment, $gatewayId, $status, $attemptStatus, $expiresAt, $paidAt, $gatewayUpdatedAt, $transactionData): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if (($gatewayUpdatedAt !== null && $lockedAttempt->gateway_updated_at !== null && $gatewayUpdatedAt->lessThan($lockedAttempt->gateway_updated_at))
                || (in_array($lockedAttempt->status, ['approved', 'rejected', 'cancelled', 'attention_required'], true)
                    && in_array($attemptStatus, ['pending', 'in_process'], true))) {
                return;
            }

            $lockedAttempt->forceFill([
                'gateway_payment_id' => (string) $gatewayId,
                'status' => $attemptStatus,
                'gateway_status' => $status,
                'gateway_status_detail' => $gatewayPayment['status_detail'] ?? null,
                'payment_method_detail' => $gatewayPayment['payment_method_id'] ?? null,
                'expires_at' => $expiresAt,
                'paid_at' => $paidAt,
                'gateway_updated_at' => $gatewayUpdatedAt ?? $lockedAttempt->gateway_updated_at,
                'pix_copy_paste' => data_get($transactionData, 'qr_code'),
                'pix_qr_code_base64' => data_get($transactionData, 'qr_code_base64'),
                'error_code' => null,
            ])->save();

            $lockedOrder->gateway_payment_id = (string) $gatewayId;
            $lockedOrder->payment_status = $status;
            $lockedOrder->payment_amount = $lockedAttempt->amount;
            $lockedOrder->payment_currency = $lockedAttempt->currency;
            $lockedOrder->payment_method = $lockedAttempt->payment_method;
            $lockedOrder->payment_detail = $gatewayPayment['payment_method_id'] ?? null;
            $lockedOrder->payment_status_detail = $gatewayPayment['status_detail'] ?? null;
            $lockedOrder->payment_expires_at = $expiresAt;
            $lockedOrder->payment_qr_code = data_get($transactionData, 'qr_code');

            if ($status === 'approved') {
                $lockedOrder->paid_at = $paidAt;
                $reservationIsStillValid = $lockedOrder->reservation_status === 'reserved'
                    && $lockedOrder->expires_at !== null
                    && $lockedOrder->expires_at->isFuture();
                if ($reservationIsStillValid && in_array($lockedOrder->status, [
                    DirectBookingOrderStatus::PagamentoPendente,
                    DirectBookingOrderStatus::AtencaoOperacional,
                ], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::PagoEmConfirmacao, ['source' => 'mercadopago_authoritative_lookup', 'payment_id' => (string) $gatewayId]);
                } elseif (! in_array($lockedOrder->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::Confirmado], true)) {
                    if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                        $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'late_or_unreserved_payment', 'payment_id' => (string) $gatewayId]);
                    }
                }
            } elseif (in_array($status, ['rejected', 'cancelled'], true) && $lockedOrder->status === DirectBookingOrderStatus::PagamentoPendente) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoRecusado, ['source' => 'mercadopago_authoritative_lookup', 'payment_id' => (string) $gatewayId]);
            } elseif ($attemptStatus === 'unknown' || $attemptStatus === 'attention_required') {
                if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'mercadopago_authoritative_lookup', 'payment_id' => (string) $gatewayId]);
                }
            }

            $lockedOrder->save();
        });

        $httpStatus = in_array($attemptStatus, ['pending', 'in_process', 'approved', 'rejected', 'cancelled'], true) ? 201 : 503;

        return $this->result($attempt->refresh(), $attemptStatus, $this->paymentMessage($attemptStatus), $httpStatus);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    private function replay(DirectBookingPaymentAttempt $attempt, DirectBookingOrder $order, string $fingerprint): array
    {
        if ($attempt->direct_booking_order_id !== $order->id || ! hash_equals($attempt->request_fingerprint, $fingerprint)) {
            return $this->result(null, 'idempotency_key_reused', 'Esta chave já foi usada em outra tentativa ou com dados diferentes.', 409);
        }

        return [
            'attempt' => $attempt,
            'code' => $attempt->status,
            'message' => $this->paymentMessage($attempt->status),
            'status' => 200,
            'replayed' => true,
        ];
    }

    /** @param array<string, mixed> $input */
    private function requestFingerprint(array $input): string
    {
        unset($input['idempotencyKey']);
        ksort($input);

        return hash_hmac('sha256', json_encode($input, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
    }

    private function markOrderForAttention(DirectBookingOrder $order, string $code): void
    {
        DB::transaction(function () use ($order, $code): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'payment_gateway', 'code' => $code]);
            }
            $lockedOrder->payment_status = 'unknown';
            $lockedOrder->save();
        });
    }

    private function parseDate(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (Throwable) {
            return null;
        }
    }

    private function paymentMessage(string $status): string
    {
        return match ($status) {
            'approved' => 'Pagamento recebido. A reserva ainda depende de confirmação na Stays.',
            'pending', 'in_process' => 'Pagamento em processamento. A reserva ainda não está confirmada.',
            'rejected' => 'Pagamento não aprovado. O pedido pode aceitar uma nova tentativa enquanto a pré-reserva estiver válida.',
            'cancelled' => 'A tentativa de pagamento foi cancelada.',
            'unknown' => 'O estado do pagamento precisa de reconciliação antes de qualquer nova tentativa.',
            'attention_required' => 'A tentativa exige conferência operacional.',
            default => 'Tentativa de pagamento registrada.',
        };
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    private function result(?DirectBookingPaymentAttempt $attempt, string $code, string $message, int $status, bool $replayed = false): array
    {
        return compact('attempt', 'code', 'message', 'status', 'replayed');
    }
}
