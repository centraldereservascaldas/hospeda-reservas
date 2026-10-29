<?php

namespace App\Services\Payments;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Requests\StoreCheckoutPaymentRequest;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysReservationService;
use App\Services\MoneyAmount;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class CieloCheckoutPaymentService
{
    public function __construct(
        private readonly CieloEcommerceClient $cielo,
        private readonly CieloSilentOrderPostClient $sop,
        private readonly DirectStaysReservationService $reservations,
        private readonly CieloDirectConfiguration $configuration,
        private readonly CieloCardPricing $pricing,
    ) {}

    public function isAvailable(): bool
    {
        return $this->cielo->isConfigured()
            && $this->configuration->canCharge()
            && (bool) config('direct-booking.enabled', false)
            && (bool) config('direct-booking.payments_enabled', false)
            && (bool) config('direct-booking.confirmation_enabled', false)
            && (int) config('direct-booking.resume_token_ttl_days', 0) > 0
            && $this->hasExternalMailTransport()
            && in_array(config('direct-booking.stays_payment_type'), ['credit', 'debit'], true)
            && is_string(config('direct-booking.stays_payment_provider_id'))
            && trim((string) config('direct-booking.stays_payment_provider_id')) !== ''
            && is_string(config('services.stays.client_id'))
            && trim((string) config('services.stays.client_id')) !== ''
            && is_string(config('services.stays.client_secret'))
            && trim((string) config('services.stays.client_secret')) !== ''
            && (string) config('direct-booking.notification_queue_connection', 'database') !== 'sync'
            && config('queue.connections.'.config('direct-booking.notification_queue_connection', 'database')) !== null;
    }

    /** @return list<string> */
    public function availableMethods(): array
    {
        if (! $this->isAvailable()) {
            return [];
        }

        return array_values(array_filter([
            $this->sop->isConfigured() ? 'card' : null,
            (bool) $this->configuration->value('pix_enabled') ? 'pix' : null,
        ]));
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function createAttempt(DirectBookingOrder $order, StoreCheckoutPaymentRequest $request): array
    {
        if (! $this->isAvailable() || ! $this->orderUsesCurrentMerchant($order)) {
            return $this->result(null, 'payment_configuration_incomplete', 'O pagamento Cielo ainda não está habilitado para este pedido.', 503);
        }

        $input = $request->validated();
        $paymentMethod = $input['paymentMethod'];
        if (! in_array($paymentMethod, $this->availableMethods(), true)
            || ($paymentMethod === 'card'
                && mb_strtolower(trim($input['cardholderEmail'])) !== mb_strtolower(trim($order->guest_email)))) {
            return $this->result(null, 'payment_method_unavailable', 'Este método de pagamento ainda não está disponível.', 503);
        }
        if ($paymentMethod === 'card' && ! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $input['token'])) {
            return $this->result(null, 'invalid_payment_token', 'Não foi possível validar o token do cartão. Recarregue os campos e tente novamente.', 422);
        }
        $baseAmountCents = MoneyAmount::toCents($order->quote_total);
        if ($baseAmountCents === null) {
            return $this->result(null, 'unsupported_payment_amount', 'O valor do pedido não é compatível com o pagamento.', 422);
        }
        $paymentPricing = $paymentMethod === 'card'
            ? $this->pricing->calculate($order->quote_total, (int) $input['installments'])
            : ['baseCents' => $baseAmountCents, 'feeCents' => 0, 'totalCents' => $baseAmountCents, 'rateBasisPoints' => 0];
        if ($paymentMethod === 'card' && intdiv($paymentPricing['totalCents'], (int) $input['installments']) < 500) {
            return $this->result(null, 'invalid_installments', 'Cada parcela precisa ter o valor mínimo de R$ 5,00.', 422);
        }

        $idempotencyKey = $input['idempotencyKey'];
        $fingerprint = $this->requestFingerprint($input);
        $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existingAttempt !== null) {
            return $this->replay($existingAttempt, $order, $fingerprint);
        }

        $reservationMatches = $this->reservations->validateReservedOrderForPayment($order);
        if ($reservationMatches === null) {
            return $this->result(null, 'reservation_state_unavailable', 'Não foi possível confirmar os dados da pré-reserva na Stays. Nenhuma cobrança foi iniciada.', 503);
        }
        if (! $reservationMatches) {
            return $this->result(null, 'stays_reservation_mismatch', 'A pré-reserva não corresponde mais ao pedido. Nenhuma cobrança foi iniciada.', 409);
        }

        try {
            $attempt = DB::transaction(function () use ($order, $idempotencyKey, $fingerprint, $input, $paymentMethod, $paymentPricing): DirectBookingPaymentAttempt|array {
                $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
                $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
                if ($existingAttempt !== null) {
                    return ['existing' => $existingAttempt];
                }

                if (! $this->orderUsesCurrentMerchant($lockedOrder)
                    || ! in_array($lockedOrder->status, [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::PagamentoRecusado], true)
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

                $attempt = DirectBookingPaymentAttempt::query()->create([
                    'direct_booking_order_id' => $lockedOrder->id,
                    'idempotency_key' => $idempotencyKey,
                    'request_fingerprint' => $fingerprint,
                    'gateway_provider' => $this->configuration->provider(),
                    'gateway_merchant_id' => $lockedOrder->gateway_merchant_id,
                    'merchant_order_id' => str_replace('-', '', (string) Str::uuid()),
                    'payment_method' => $paymentMethod,
                    'payment_method_id' => $paymentMethod === 'card' ? 'cielo_credit_card' : 'cielo_pix',
                    'installments' => $paymentMethod === 'card' ? (int) $input['installments'] : null,
                    'status' => 'processing',
                    'amount' => $this->pricing->decimal($paymentPricing['totalCents']),
                    'base_amount' => $this->pricing->decimal($paymentPricing['baseCents']),
                    'processing_fee_amount' => $this->pricing->decimal($paymentPricing['feeCents']),
                    'processing_fee_basis_points' => $paymentPricing['rateBasisPoints'],
                    'currency' => $lockedOrder->currency,
                    'expires_at' => $lockedOrder->expires_at,
                    'gateway_submission_started_at' => now(),
                    'gateway_submission_count' => 1,
                ]);

                if ($lockedOrder->status !== DirectBookingOrderStatus::PagamentoPendente) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoPendente, ['source' => 'payment_attempt_started', 'gateway' => $this->configuration->provider()]);
                }
                $lockedOrder->payment_status = 'pending';
                $lockedOrder->payment_amount = $this->pricing->decimal($paymentPricing['totalCents']);
                $lockedOrder->payment_currency = $lockedOrder->currency;
                $lockedOrder->payment_method = $paymentMethod;
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
            return $this->result(null, $attempt['error'], 'Já existe uma tentativa de pagamento pendente para este pedido ou o pedido não está pronto para pagamento.', 409);
        }

        try {
            if ($paymentMethod === 'card') {
                $gatewayPayment = $this->cielo->createCardPayment(
                    $input['token'],
                    (string) $attempt->merchant_order_id,
                    (string) $attempt->amount,
                    (string) $attempt->currency,
                    $order->guest_name,
                    $input['payerIdentification']['number'],
                    (int) $input['installments'],
                );
            } else {
                $configuredExpiration = max(60, min(86_400, (int) $this->configuration->value('pix_qr_expiration_seconds')));
                $remainingSeconds = max(60, min(86_400, now()->diffInSeconds($order->expires_at, false)));
                $gatewayPayment = $this->cielo->createPixPayment(
                    (string) $attempt->merchant_order_id,
                    (string) $attempt->amount,
                    (string) $attempt->currency,
                    $order->guest_name,
                    min($configuredExpiration, $remainingSeconds),
                );
            }

            return $this->applyGatewayPayment($attempt->order, $attempt, $gatewayPayment);
        } catch (Throwable) {
            $attempt->forceFill([
                'status' => 'unknown',
                'gateway_status' => 'unknown',
                'error_code' => 'gateway_result_unknown',
            ])->save();
            $this->markOrderForAttention($attempt->order, 'gateway_result_unknown');

            return $this->result($attempt->refresh(), 'gateway_result_unknown', 'O resultado da solicitação ao gateway é incerto e será conciliado antes de permitir outra tentativa.', 503);
        }
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool, gatewayStatus: string|null} */
    public function reconcilePaymentId(string $paymentId): array
    {
        $gatewayPayment = $this->cielo->findPaymentById($paymentId);
        if ($gatewayPayment === null) {
            throw new \RuntimeException('Cielo payment was not found.');
        }

        $merchantOrderId = $gatewayPayment['MerchantOrderId'] ?? null;
        if (! is_string($merchantOrderId)) {
            throw new \RuntimeException('Cielo payment does not include a MerchantOrderId.');
        }

        $attempt = DirectBookingPaymentAttempt::query()
            ->where('gateway_provider', $this->configuration->provider())
            ->where('merchant_order_id', $merchantOrderId)
            ->first();
        if ($attempt === null || ! $this->attemptUsesCurrentMerchant($attempt)) {
            throw new \RuntimeException('Cielo payment does not match a persisted attempt and merchant identity.');
        }

        return $this->applyGatewayPayment($attempt->order, $attempt, $gatewayPayment, $paymentId);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool, gatewayStatus: string|null} */
    public function reconcileAttempt(DirectBookingPaymentAttempt $attempt): array
    {
        if (! $this->attemptUsesCurrentMerchant($attempt)) {
            $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_merchant_identity_changed'])->save();
            $this->markOrderForAttention($attempt->order, 'gateway_merchant_identity_changed');

            return [...$this->result($attempt->refresh(), 'gateway_merchant_identity_changed', 'A identidade da conta Cielo mudou. A tentativa foi bloqueada para conferência.', 503), 'gatewayStatus' => $attempt->gateway_status];
        }

        $gatewayPayment = $attempt->gateway_payment_id !== null
            ? $this->cielo->findPaymentById($attempt->gateway_payment_id)
            : $this->cielo->findPaymentByMerchantOrderId((string) $attempt->merchant_order_id);
        if ($gatewayPayment === null) {
            $attempt->forceFill(['status' => 'unknown', 'error_code' => 'gateway_result_unknown'])->save();

            return [...$this->result($attempt->refresh(), 'gateway_result_unknown', 'A consulta da Cielo ainda não encontrou o pagamento. A tentativa continua bloqueada.', 503), 'gatewayStatus' => null];
        }

        return $this->applyGatewayPayment($attempt->order, $attempt, $gatewayPayment, $attempt->gateway_payment_id);
    }

    private function applyGatewayPayment(
        DirectBookingOrder $order,
        DirectBookingPaymentAttempt $attempt,
        array $gatewayPayment,
        ?string $expectedPaymentId = null,
    ): array {
        $merchantOrderId = $gatewayPayment['MerchantOrderId'] ?? null;
        $payment = is_array($gatewayPayment['Payment'] ?? null) ? $gatewayPayment['Payment'] : [];
        $paymentId = $payment['PaymentId'] ?? $gatewayPayment['PaymentId'] ?? null;
        $conflictingPaymentIds = isset($payment['PaymentId'], $gatewayPayment['PaymentId'])
            && $payment['PaymentId'] !== $gatewayPayment['PaymentId'];
        $paymentStatus = filter_var($payment['Status'] ?? null, FILTER_VALIDATE_INT);
        $amountCents = filter_var($payment['Amount'] ?? null, FILTER_VALIDATE_INT);
        $orderAmountCents = MoneyAmount::toCents($order->quote_total);
        $attemptBaseAmountCents = MoneyAmount::toCents($attempt->base_amount ?? $attempt->amount);
        $attemptAmountCents = MoneyAmount::toCents($attempt->amount);
        $paymentType = $payment['Type'] ?? null;
        $expectedPaymentType = $attempt->payment_method === 'pix' ? 'Pix' : 'CreditCard';
        $pixCopyPaste = $attempt->payment_method === 'pix'
            ? $this->safePixCopyPaste($payment['QrCodeString'] ?? null)
            : null;
        $pixQrCode = $attempt->payment_method === 'pix'
            ? $this->safePixQrCode($payment['QrCodeBase64Image'] ?? null)
            : null;
        $initialPixResponseMissingInstructions = $attempt->payment_method === 'pix'
            && $attempt->gateway_payment_id === null
            && $paymentStatus === 12
            && ($pixCopyPaste === null || $pixQrCode === null);

        if ($conflictingPaymentIds || ! is_string($paymentId)
            || ! preg_match('/^[0-9a-f-]{36}$/iD', $paymentId)
            || ($expectedPaymentId !== null && ! hash_equals($expectedPaymentId, $paymentId))
            || ! is_string($merchantOrderId)
            || ! hash_equals((string) $attempt->merchant_order_id, $merchantOrderId)
            || $paymentStatus === false
            || $amountCents === false
            || $orderAmountCents === null
            || $attemptBaseAmountCents !== $orderAmountCents
            || $amountCents !== $attemptAmountCents
            || ($payment['Currency'] ?? null) !== $order->currency
            || $paymentType !== $expectedPaymentType
            || $initialPixResponseMissingInstructions) {
            $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_payment_mismatch'])->save();
            $this->markOrderForAttention($order, 'gateway_payment_mismatch');

            return $this->result($attempt->refresh(), 'gateway_payment_mismatch', 'O gateway retornou dados que não correspondem ao pedido. A confirmação foi interrompida.', 503);
        }

        $status = match ($paymentStatus) {
            2 => 'captured',
            1 => 'authorized',
            3 => 'rejected',
            10, 13 => 'cancelled',
            11 => 'refunded',
            default => 'pending',
        };
        $attemptStatus = match ($status) {
            'captured' => 'approved',
            'authorized', 'pending' => 'pending',
            'rejected' => 'rejected',
            'cancelled' => 'cancelled',
            default => 'attention_required',
        };
        $paidAt = $status === 'captured' ? ($this->parseDate($payment['CapturedDate'] ?? null) ?? now()) : null;
        $gatewayExpiration = $this->parseDate($payment['ExpirationDate'] ?? null);
        $expiresAt = $gatewayExpiration !== null && $order->expires_at !== null && $gatewayExpiration->lessThan($order->expires_at)
            ? $gatewayExpiration
            : $order->expires_at;

        $paymentIdConflict = DB::transaction(function () use ($order, $attempt, $paymentId, $status, $attemptStatus, $payment, $paidAt, $expiresAt, $pixCopyPaste, $pixQrCode): bool {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedAttempt->gateway_payment_id !== null && $lockedAttempt->gateway_payment_id !== $paymentId) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_payment_id_conflict'])->save();
                $this->markOrderForAttention($lockedOrder, 'gateway_payment_id_conflict');

                return true;
            }

            $gatewayStatusDetail = $payment['ReturnMessage'] ?? $payment['ReasonMessage'] ?? null;
            $lockedAttempt->forceFill([
                'gateway_payment_id' => $paymentId,
                'status' => $attemptStatus,
                'gateway_status' => $status,
                'gateway_status_detail' => is_string($gatewayStatusDetail) ? mb_substr($gatewayStatusDetail, 0, 100) : null,
                'payment_method_detail' => $lockedAttempt->payment_method === 'pix' ? 'Pix' : 'CreditCard',
                'expires_at' => $expiresAt,
                'paid_at' => $paidAt,
                'gateway_updated_at' => $this->parseDate($payment['ReceivedDate'] ?? null) ?? now(),
                'pix_copy_paste' => $attemptStatus === 'pending'
                    ? ($pixCopyPaste ?? $lockedAttempt->pix_copy_paste)
                    : null,
                'pix_qr_code_base64' => $attemptStatus === 'pending'
                    ? ($pixQrCode ?? $lockedAttempt->pix_qr_code_base64)
                    : null,
                'error_code' => $status === 'refunded' ? 'gateway_refund_reported' : null,
            ])->save();

            $lockedOrder->gateway_payment_id = $paymentId;
            $lockedOrder->payment_status = $status === 'captured' ? 'approved' : $status;
            $lockedOrder->payment_amount = $lockedAttempt->amount;
            $lockedOrder->payment_currency = $lockedAttempt->currency;
            $lockedOrder->payment_method = $lockedAttempt->payment_method;
            $lockedOrder->payment_detail = $lockedAttempt->payment_method === 'pix' ? 'Pix' : 'CreditCard';
            $lockedOrder->payment_status_detail = is_string($gatewayStatusDetail) ? mb_substr($gatewayStatusDetail, 0, 100) : null;
            $lockedOrder->payment_expires_at = $expiresAt;
            if ($status === 'captured') {
                $lockedOrder->paid_at = $paidAt;
                $reservationIsStillValid = $lockedOrder->reservation_status === 'reserved'
                    && $lockedOrder->expires_at !== null
                    && $lockedOrder->expires_at->isFuture();
                if ($reservationIsStillValid && in_array($lockedOrder->status, [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::AtencaoOperacional], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::PagoEmConfirmacao, ['source' => 'cielo_authoritative_lookup', 'payment_id' => $paymentId]);
                } elseif (! in_array($lockedOrder->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::Confirmado, DirectBookingOrderStatus::CancelamentoSolicitado, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::Concluido], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_late_or_unreserved_payment', 'payment_id' => $paymentId]);
                }
            } elseif ($status === 'rejected' && $lockedOrder->status === DirectBookingOrderStatus::PagamentoPendente) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoRecusado, ['source' => 'cielo_authoritative_lookup', 'payment_id' => $paymentId]);
            } elseif ($attemptStatus === 'attention_required') {
                if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_authoritative_lookup', 'payment_id' => $paymentId]);
                }
            }

            $lockedOrder->save();

            return false;
        });

        $attempt->refresh();
        if ($paymentIdConflict) {
            return $this->result($attempt, 'gateway_payment_id_conflict', 'A tentativa recebeu mais de um identificador de pagamento. A conferência foi interrompida.', 503);
        }

        $httpStatus = in_array($attempt->status, ['pending', 'approved', 'rejected', 'cancelled'], true) ? 201 : 503;

        return [
            ...$this->result($attempt, $attempt->status, $this->paymentMessage($attempt->status), $httpStatus),
            'gatewayStatus' => $status,
        ];
    }

    private function orderUsesCurrentMerchant(DirectBookingOrder $order): bool
    {
        return $order->gateway_provider === $this->configuration->provider()
            && is_string($order->gateway_merchant_id)
            && hash_equals($order->gateway_merchant_id, (string) $this->cielo->merchantId());
    }

    private function attemptUsesCurrentMerchant(DirectBookingPaymentAttempt $attempt): bool
    {
        return $this->cielo->isConfigured()
            && $attempt->gateway_provider === $this->configuration->provider()
            && is_string($attempt->gateway_merchant_id)
            && hash_equals($attempt->gateway_merchant_id, (string) $this->cielo->merchantId())
            && $this->orderUsesCurrentMerchant($attempt->order);
    }

    private function hasExternalMailTransport(?string $mailerName = null, array $visitedMailers = []): bool
    {
        $mailerName ??= (string) config('mail.default', 'log');
        if ($mailerName === '' || in_array($mailerName, $visitedMailers, true)) {
            return false;
        }

        $mailer = config('mail.mailers.'.$mailerName);
        if (! is_array($mailer) || ! is_string($mailer['transport'] ?? null) || in_array($mailer['transport'], ['log', 'array'], true)) {
            return false;
        }

        if (in_array($mailer['transport'], ['failover', 'roundrobin'], true)) {
            $fallbackMailers = $mailer['mailers'] ?? null;

            return is_array($fallbackMailers) && $fallbackMailers !== [] && collect($fallbackMailers)->every(fn (mixed $fallback): bool => is_string($fallback) && $this->hasExternalMailTransport($fallback, [...$visitedMailers, $mailerName]));
        }

        return in_array($mailer['transport'], ['smtp', 'sendmail', 'mailgun', 'ses', 'ses-v2', 'postmark', 'resend'], true);
    }

    private function requestFingerprint(array $input): string
    {
        unset($input['idempotencyKey']);
        ksort($input);

        return hash_hmac('sha256', json_encode($input, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
    }

    private function replay(DirectBookingPaymentAttempt $attempt, DirectBookingOrder $order, string $fingerprint): array
    {
        if ($attempt->direct_booking_order_id !== $order->id || ! hash_equals($attempt->request_fingerprint, $fingerprint)) {
            return $this->result(null, 'idempotency_key_reused', 'Esta chave de tentativa já foi usada com dados diferentes.', 409);
        }

        return $this->result($attempt, $attempt->status, $this->paymentMessage($attempt->status), 200, true);
    }

    private function markOrderForAttention(DirectBookingOrder $order, string $code): void
    {
        DB::transaction(function () use ($order, $code): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if (! in_array($lockedOrder->status, [DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::Concluido], true)) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_gateway', 'code' => $code]);
            }
            if (! in_array($lockedOrder->payment_status, ['approved', 'refunded', 'charged_back'], true)) {
                $lockedOrder->payment_status = 'unknown';
            }
            $lockedOrder->save();
        });
    }

    private function parseDate(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value, 'America/Sao_Paulo')->utc();
        } catch (Throwable) {
            return null;
        }
    }

    private function safePixCopyPaste(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value !== '' && mb_strlen($value) <= 1_000 ? $value : null;
    }

    private function safePixQrCode(mixed $value): ?string
    {
        if (! is_string($value) || strlen($value) > 100_000) {
            return null;
        }

        $decoded = base64_decode($value, true);
        if (! is_string($decoded) || ! str_starts_with($decoded, "\x89PNG\r\n\x1a\n")) {
            return null;
        }

        return $value;
    }

    private function paymentMessage(string $status): string
    {
        return match ($status) {
            'approved' => 'Pagamento recebido. A reserva ainda depende de confirmação na Stays.',
            'pending' => 'Pagamento em processamento. A reserva ainda não está confirmada.',
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
