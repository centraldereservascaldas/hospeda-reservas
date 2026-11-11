<?php

namespace App\Services\Payments;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Requests\StoreCheckoutPaymentRequest;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\DirectStaysReservationService;
use App\Services\ExistingReservationBalanceApproval;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\ExistingReservationPaymentCycleRegistry;
use App\Services\ExistingReservationPaymentLock;
use App\Services\MoneyAmount;
use App\Services\ReservationCoordinationMode;
use App\Services\ReservationReleaseGuard;
use App\Services\StaysReservationIdentity;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
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
            && (! config('direct-booking.send_confirmation_email', false) || $this->hasExternalMailTransport())
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

    /** @param array<string, mixed> $context */
    private function logCheckoutPaymentEvent(string $level, string $event, array $context): void
    {
        $safeContext = array_filter([
            'event' => $event,
            'correlation_id' => $context['attempt_id'] ?? $context['order_id'] ?? null,
            'order_id' => $context['order_id'] ?? null,
            'attempt_id' => $context['attempt_id'] ?? null,
            'gateway' => 'cielo',
            'payment_method' => $context['payment_method'] ?? null,
            'reason' => $context['reason'] ?? null,
            'phase' => $context['phase'] ?? null,
            'result_code' => $context['result_code'] ?? null,
            'http_status' => $context['http_status'] ?? null,
            'gateway_http_status' => $context['gateway_http_status'] ?? null,
            'exception_class' => $context['exception_class'] ?? null,
            'gateway_error_codes' => $context['gateway_error_codes'] ?? null,
            'payment_status' => $context['payment_status'] ?? null,
        ], static fn (mixed $value): bool => $value !== null);

        Log::log($level, $event, $safeContext);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function createAttempt(DirectBookingOrder $order, StoreCheckoutPaymentRequest $request): array
    {
        if (! $this->isAvailable() || ! $this->orderUsesCurrentMerchant($order)) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'reason' => 'payment_configuration_incomplete',
            ]);

            return $this->result(null, 'payment_configuration_incomplete', 'O pagamento Cielo ainda não está habilitado para este pedido.', 503);
        }

        $input = $request->validated();
        $paymentMethod = $input['paymentMethod'];
        if (! $this->bootstrapApprovalValid($order)) {
            return $this->result(null, 'existing_balance_unverified', 'O saldo desta reserva precisa de nova conferência. Nenhuma cobrança foi iniciada.', 409);
        }
        if ($order->origin === 'stays_existing') {
            $existingSnapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
            $snapshot = is_array($existingSnapshot) ? ($existingSnapshot['channel_provider_ids'] ?? null) : null;
            $installments = $paymentMethod === 'card' ? (int) ($input['installments'] ?? 0) : null;
            $provider = is_array($snapshot) ? app(ExistingReservationPaymentChannels::class)->verifiedProvider($snapshot, $paymentMethod, $installments) : null;
            if ($provider === null || ! is_array($existingSnapshot) || ($existingSnapshot['pending_provider_id'] ?? null) !== $provider) {
                return $this->result(null, 'existing_payment_channel_unavailable', 'O meio de pagamento precisa de conferência antes de continuar. Nenhuma cobrança foi iniciada.', 503);
            }
        }
        if (! in_array($paymentMethod, $this->availableMethods(), true)
            || ($paymentMethod === 'card'
                && mb_strtolower(trim($input['cardholderEmail'])) !== mb_strtolower(trim($order->guest_email)))) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => $paymentMethod,
                'reason' => 'payment_method_unavailable_or_payer_mismatch',
            ]);

            return $this->result(null, 'payment_method_unavailable', 'Este método de pagamento ainda não está disponível.', 503);
        }
        if ($paymentMethod === 'card' && ! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $input['token'])) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => 'card',
                'reason' => 'invalid_payment_token',
            ]);

            return $this->result(null, 'invalid_payment_token', 'Não foi possível validar o token do cartão. Recarregue os campos e tente novamente.', 422);
        }
        $baseAmountCents = MoneyAmount::toCents($order->quote_total);
        if ($baseAmountCents === null) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => $paymentMethod,
                'reason' => 'unsupported_payment_amount',
            ]);

            return $this->result(null, 'unsupported_payment_amount', 'O valor do pedido não é compatível com o pagamento.', 422);
        }
        $paymentPricing = $paymentMethod === 'card'
            ? $this->pricing->calculate($order->quote_total, (int) $input['installments'])
            : ['baseCents' => $baseAmountCents, 'feeCents' => 0, 'totalCents' => $baseAmountCents, 'rateBasisPoints' => 0];
        if ($paymentMethod === 'card' && intdiv($paymentPricing['totalCents'], (int) $input['installments']) < 500) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => 'card',
                'reason' => 'invalid_installments',
            ]);

            return $this->result(null, 'invalid_installments', 'Cada parcela precisa ter o valor mínimo de R$ 5,00.', 422);
        }

        $idempotencyKey = $input['idempotencyKey'];
        $fingerprint = $this->requestFingerprint($input);
        $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existingAttempt !== null) {
            return $this->replay($existingAttempt, $order, $fingerprint);
        }

        if ($order->origin === 'stays_existing'
            && config('direct-booking.experimental_existing_ledger_audit_enabled', false) !== true) {
            return $this->result(null, 'existing_balance_unverified', 'O saldo desta reserva precisa de nova conferência. Nenhuma nova cobrança foi iniciada.', 409);
        }

        if ($paymentMethod === 'pix' && $this->configuration->usesLegacyPix()
            && ($order->expires_at === null || $order->expires_at->lessThanOrEqualTo(now()->addSeconds(7200 + max(60, (int) config('direct-booking.payment_safety_margin_minutes', 5) * 60))))) {
            return $this->result(null, 'reservation_expires_too_soon', 'O prazo da pré-reserva é insuficiente para gerar este Pix com segurança. Nenhuma cobrança foi iniciada.', 409);
        }

        $reservationMatches = $this->reservations->validateReservedOrderForPayment($order);
        if ($reservationMatches === null) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => $paymentMethod,
                'reason' => 'reservation_state_unavailable',
            ]);

            return $this->result(null, 'reservation_state_unavailable', 'Não foi possível confirmar os dados da pré-reserva na Stays. Nenhuma cobrança foi iniciada.', 503);
        }
        if (! $reservationMatches) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => $paymentMethod,
                'reason' => 'stays_reservation_mismatch',
            ]);

            return $this->result(null, 'stays_reservation_mismatch', 'A pré-reserva não corresponde mais ao pedido. Nenhuma cobrança foi iniciada.', 409);
        }

        $ledgerSnapshot = null;
        if ($order->origin === 'stays_existing' && config('direct-booking.experimental_existing_ledger_audit_enabled', false) === true) {
            $ledgerSnapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
            if (! is_array($ledgerSnapshot) || ! app(ExistingReservationLedgerAudit::class)->confirmsSnapshot($ledgerSnapshot)) {
                return $this->result(null, 'existing_balance_unverified', 'O saldo desta reserva precisa de nova conferência. Nenhuma cobrança foi iniciada.', 409);
            }
        }

        $serializeReservation = $this->serializeReservation($order);
        $identity = $serializeReservation && is_string($order->stays_reservation_id)
            ? app(StaysReservationIdentity::class)->resolve($order->stays_reservation_id) : null;
        if ($serializeReservation && $identity === null) {
            return $this->result(null, 'existing_reservation_unverified', 'Os dados da reserva precisam de conferência. Nenhuma cobrança foi iniciada.', 409);
        }

        $cyclePreparation = $order->origin === 'stays_existing' && is_string($order->stays_reservation_id)
            ? app(ExistingReservationPaymentCycleRegistry::class)->prepare($order->stays_reservation_id) : null;

        try {
            $persistAttempt = function () use ($order, $idempotencyKey, $fingerprint, $input, $paymentMethod, $paymentPricing, $serializeReservation, $identity, $ledgerSnapshot, $cyclePreparation): DirectBookingPaymentAttempt|array {
                $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
                $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
                if ($existingAttempt !== null) {
                    return ['existing' => $existingAttempt];
                }

                if (($serializeReservation && ($lockedOrder->origin !== $order->origin
                        || $lockedOrder->stays_reservation_id !== $order->stays_reservation_id))
                    || ($identity !== null && app(ReservationReleaseGuard::class)->paymentBlocked($identity['canonical'], $identity['code']))
                    || ! $this->orderUsesCurrentMerchant($lockedOrder)
                    || ($ledgerSnapshot !== null && ($lockedOrder->quote_snapshot['existing_reservation'] ?? null) !== $ledgerSnapshot)
                    || ($lockedOrder->origin === 'stays_existing' && config('direct-booking.experimental_existing_ledger_audit_enabled', false) === true && $ledgerSnapshot === null)
                    || ! $this->bootstrapApprovalValid($lockedOrder)
                    || ! in_array($lockedOrder->status, [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::PagamentoRecusado], true)
                    || $lockedOrder->stays_reservation_id === null
                    || ! ($lockedOrder->reservation_status === 'reserved'
                        || ($lockedOrder->origin === 'stays_existing'
                            && config('direct-booking.existing_reservation_checkout_enabled', false)
                            && $lockedOrder->reservation_status === 'booked'))
                    || $lockedOrder->expires_at === null
                    || $lockedOrder->expires_at->lessThanOrEqualTo(now())) {
                    return ['error' => 'order_not_payable'];
                }

                $statuses = ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'];
                if ($lockedOrder->origin === 'stays_existing' && config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true) {
                    // Registry verifies every approved attempt against its settled proof.
                    $statuses = array_values(array_diff($statuses, ['approved']));
                }
                $attempts = DirectBookingPaymentAttempt::query()->whereIn('status', $statuses);
                if ($serializeReservation) {
                    $attempts->where(fn ($query) => $query->where('stays_reservation_canonical_id', $identity['canonical'])
                        ->orWhereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', [$identity['canonical'], strtoupper($identity['canonical']), $identity['code']])));
                } else {
                    $attempts->where('direct_booking_order_id', $lockedOrder->id);
                }
                $activeAttemptExists = $attempts->exists();
                if ($activeAttemptExists) {
                    return ['error' => 'payment_attempt_in_progress'];
                }

                $cycle = null;
                if ($lockedOrder->origin === 'stays_existing') {
                    $cycle = app(ExistingReservationPaymentCycleRegistry::class)->open($lockedOrder->stays_reservation_id, $lockedOrder->id, $idempotencyKey, $identity['code'], $cyclePreparation);
                    if ($cycle['status'] !== 'opened' || ! is_string($cycle['cycle_id'])) {
                        return ['error' => 'payment_cycle_unavailable'];
                    }
                }

                $attempt = DirectBookingPaymentAttempt::query()->create([
                    'direct_booking_order_id' => $lockedOrder->id,
                    'stays_reservation_canonical_id' => $identity['canonical'] ?? null,
                    'idempotency_key' => $idempotencyKey,
                    'request_fingerprint' => $fingerprint,
                    'gateway_provider' => $this->configuration->provider(),
                    'gateway_merchant_id' => $lockedOrder->gateway_merchant_id,
                    'merchant_order_id' => $paymentMethod === 'pix' ? Str::random(25) : str_replace('-', '', (string) Str::uuid()),
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

                if ($cycle !== null && ! app(ExistingReservationPaymentCycleRegistry::class)->bindAttempt($cycle['cycle_id'], $lockedOrder, $attempt)) {
                    throw new \RuntimeException('Could not bind the payment attempt to its reservation cycle.');
                }

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
            };
            $attempt = $serializeReservation
                ? app(ExistingReservationPaymentLock::class)->synchronized($identity['canonical'], $persistAttempt)
                : (Schema::hasTable('existing_reservation_payment_locks')
                    ? app(ExistingReservationPaymentLock::class)->synchronizedDecision(fn () => $this->serializeReservation($order) ? ['error' => 'existing_reservation_unverified'] : $persistAttempt())
                    : DB::transaction($persistAttempt));
        } catch (UniqueConstraintViolationException) {
            $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
            if ($existingAttempt !== null) {
                return $this->replay($existingAttempt, $order, $fingerprint);
            }

            $this->logCheckoutPaymentEvent('error', 'checkout.payment.persistence_conflict', [
                'order_id' => $order->id,
                'payment_method' => $paymentMethod,
                'reason' => 'payment_attempt_conflict',
            ]);

            return $this->result(null, 'payment_attempt_conflict', 'Não foi possível registrar a tentativa de pagamento.', 409);
        }

        if (is_array($attempt) && isset($attempt['existing'])) {
            return $this->replay($attempt['existing'], $order, $fingerprint);
        }
        if (is_array($attempt)) {
            $this->logCheckoutPaymentEvent('warning', 'checkout.payment.blocked', [
                'order_id' => $order->id,
                'payment_method' => $paymentMethod,
                'reason' => $attempt['error'],
            ]);

            return $this->result(null, $attempt['error'], 'Já existe uma tentativa de pagamento pendente para este pedido ou o pedido não está pronto para pagamento.', 409);
        }

        try {
            $gatewayPhase = 'submit_payment';
            $this->logCheckoutPaymentEvent('info', 'checkout.gateway.payment_submission_started', [
                'order_id' => $order->id,
                'attempt_id' => $attempt->id,
                'payment_method' => $attempt->payment_method,
            ]);

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
                if ($this->configuration->usesLegacyPix()) {
                    $configuredExpiration = 7200;
                }
                $remainingSeconds = max(60, min(86_400, (int) floor(now()->diffInSeconds($order->expires_at, false))));
                $gatewayPayment = $this->cielo->createPixPayment(
                    (string) $attempt->merchant_order_id,
                    (string) $attempt->amount,
                    (string) $attempt->currency,
                    $order->guest_name,
                    min($configuredExpiration, $remainingSeconds),
                    $input['payerIdentification']['number'] ?? null,
                    $input['payerIdentification']['type'] ?? null,
                );
            }

            $this->logCheckoutPaymentEvent('info', 'checkout.gateway.payment_created', [
                'order_id' => $order->id,
                'attempt_id' => $attempt->id,
                'payment_method' => $attempt->payment_method,
            ]);
            $gatewayPhase = 'validate_payment_response';
            $result = $this->applyGatewayPayment($attempt->order, $attempt, $gatewayPayment);
            $this->logCheckoutPaymentEvent(
                in_array($result['status'], [200, 201], true) ? 'info' : 'warning',
                'checkout.gateway.payment_reconciled',
                [
                    'order_id' => $order->id,
                    'attempt_id' => $attempt->id,
                    'payment_method' => $attempt->payment_method,
                    'result_code' => $result['code'],
                    'http_status' => $result['status'],
                    'payment_status' => $result['attempt']?->status,
                ],
            );

            return $result;
        } catch (Throwable $exception) {
            $response = $exception instanceof RequestException ? $exception->response : null;
            $body = $response?->json();
            $errors = is_array($body) ? (array_is_list($body) ? $body : [$body]) : [];
            $codes = collect($errors)->filter(fn (mixed $error): bool => is_array($error))
                ->map(fn (array $error): string => is_int($error['Code'] ?? null) || is_string($error['Code'] ?? null) ? (string) $error['Code'] : '')
                ->filter(fn (string $code): bool => preg_match('/^[0-9]{1,8}$/D', $code) === 1)
                ->take(10)->values()->all();
            $diagnostic = ['exception' => get_class($exception), 'http_status' => $response?->status(), 'codes' => $codes];
            $this->logCheckoutPaymentEvent('error', 'checkout.gateway.payment_result_unknown', [
                'order_id' => $order->id,
                'attempt_id' => $attempt->id,
                'payment_method' => $attempt->payment_method,
                'phase' => $gatewayPhase ?? 'submit_payment',
                'exception_class' => $exception::class,
                'gateway_http_status' => $response?->status(),
                'gateway_error_codes' => $codes,
            ]);
            if ($this->protectGatewayUnknown($attempt->order)) {
                $attempt = $this->recordExistingUnknownWithoutRegression($attempt, $diagnostic);
                if (in_array($attempt->status, ['approved', 'rejected', 'cancelled', 'expired'], true) || $this->hasAuthoritativePending($attempt)) {
                    return $this->result($attempt, $attempt->status, $this->paymentMessage($attempt->status), 200, true);
                }

                return $this->result($attempt, 'gateway_result_unknown', 'O resultado da solicitação ao gateway exige conciliação; não inicie outra cobrança.', 503);
            }
            $attempt->forceFill([
                'status' => 'unknown',
                'gateway_status' => 'unknown',
                'error_code' => 'gateway_result_unknown',
                'gateway_status_detail' => json_encode($diagnostic, JSON_THROW_ON_ERROR),
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
            if ($this->protectGatewayUnknown($attempt->order)) {
                $attempt = $this->recordExistingUnknownWithoutRegression($attempt, errorCode: 'gateway_merchant_identity_changed');
            } else {
                $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_merchant_identity_changed'])->save();
                $this->markOrderForAttention($attempt->order, 'gateway_merchant_identity_changed');
            }

            return [...$this->result($attempt->refresh(), 'gateway_merchant_identity_changed', 'A identidade da conta Cielo mudou. A tentativa foi bloqueada para conferência.', 503), 'gatewayStatus' => $attempt->gateway_status];
        }

        $gatewayPayment = $attempt->gateway_payment_id !== null
            ? $this->cielo->findPaymentById($attempt->gateway_payment_id)
            : $this->cielo->findPaymentByMerchantOrderId((string) $attempt->merchant_order_id);
        if ($gatewayPayment === null) {
            if ($this->protectGatewayUnknown($attempt->order)) {
                $attempt = $this->recordExistingUnknownWithoutRegression($attempt);
                if (in_array($attempt->status, ['approved', 'rejected', 'cancelled', 'expired'], true) || $this->hasAuthoritativePending($attempt)) {
                    return [...$this->result($attempt, $attempt->status, $this->paymentMessage($attempt->status), 200, true), 'gatewayStatus' => $attempt->gateway_status];
                }

                return [...$this->result($attempt, 'gateway_result_unknown', 'A consulta da Cielo exige conciliação; não inicie outra cobrança.', 503), 'gatewayStatus' => $attempt->gateway_status];
            }
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
            ? $this->safePixQrCode($payment['QrCodeBase64Image'] ?? $payment['QrcodeBase64Image'] ?? null)
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
            if ($this->serializeReservation($order)) {
                $attempt = $this->recordExistingUnknownWithoutRegression($attempt, errorCode: 'gateway_payment_mismatch');
            } else {
                $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_payment_mismatch'])->save();
                $this->markOrderForAttention($order, 'gateway_payment_mismatch');
            }

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
        $fraudAnalysisRequired = $expectedPaymentType === 'CreditCard'
            && ($attempt->fraud_analysis_required
                || (array_key_exists('FraudAnalysis', $payment) && $payment['FraudAnalysis'] !== null)
                || DirectBookingPaymentWebhook::query()->where('gateway_payment_id', $paymentId)->where('gateway_provider', $attempt->gateway_provider)->where('change_type', 3)->exists());
        $fraudReviewRequired = $fraudAnalysisRequired && $status === 'captured'
            && ! $this->hasAcceptedFraudAnalysis($payment['FraudAnalysis'] ?? null);
        if ($fraudReviewRequired) {
            $attemptStatus = 'attention_required';
        }
        $paidAt = $status === 'captured' ? ($this->parseDate($payment['CapturedDate'] ?? null) ?? now()) : null;
        $gatewayExpiration = $this->parseDate($payment['ExpirationDate'] ?? null);
        if ($expectedPaymentType === 'Pix' && $this->configuration->usesLegacyPix()) {
            $legacyExpiration = $attempt->created_at->copy()->addHours(2);
            if ($gatewayExpiration === null || $legacyExpiration->lessThan($gatewayExpiration)) {
                $gatewayExpiration = $legacyExpiration;
            }
        }
        $expiresAt = $gatewayExpiration !== null && $order->expires_at !== null && $gatewayExpiration->lessThan($order->expires_at)
            ? $gatewayExpiration
            : $order->expires_at;

        if ($expectedPaymentType === 'Pix' && $paymentStatus === 12 && $this->configuration->usesLegacyPix()
            && $attempt->gateway_payment_id !== null && $expiresAt !== null
            && $expiresAt->copy()->addMinutes(max(1, (int) config('direct-booking.payment_safety_margin_minutes', 5)))->isPast()) {
            $status = 'expired';
            $attemptStatus = 'expired';
        }

        $serializeReservation = $this->serializeReservation($order);
        $canonicalId = $serializeReservation ? $this->ensureAttemptReservationId($attempt) : null;
        if ($serializeReservation && $canonicalId === null) {
            return $this->result($attempt, 'existing_reservation_unverified', 'A reserva exige conferência antes da conciliação.', 503);
        }

        $applyState = function () use ($order, $attempt, $paymentId, $status, $attemptStatus, $payment, $paidAt, $expiresAt, $pixCopyPaste, $pixQrCode, $fraudReviewRequired, $fraudAnalysisRequired, $serializeReservation, $canonicalId): bool {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($serializeReservation && ($lockedOrder->origin !== $order->origin
                || $lockedOrder->stays_reservation_id !== $order->stays_reservation_id
                || $this->attemptReservationId($lockedAttempt) !== $canonicalId
                || $lockedAttempt->direct_booking_order_id !== $lockedOrder->id)) {
                throw new \RuntimeException('Reservation payment identity changed during reconciliation.');
            }
            if ($lockedOrder->origin === 'stays_existing' && $lockedAttempt->error_code === 'gateway_cycle_conflict'
                && in_array($status, ['captured', 'pending', 'authorized', 'rejected', 'expired'], true)) {
                return false;
            }
            $declinedThenCaptured = $lockedOrder->origin === 'stays_existing' && $status === 'captured'
                && DB::table('existing_reservation_payment_cycles')
                    ->where('direct_booking_payment_attempt_id', $lockedAttempt->id)->where('state', 'declined')->exists();
            $anotherConflict = $lockedOrder->origin === 'stays_existing' && $status === 'captured'
                && $lockedOrder->paymentAttempts()->whereKeyNot($lockedAttempt->id)
                    ->where('error_code', 'gateway_cycle_conflict')->exists();
            if ($declinedThenCaptured || $anotherConflict) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'gateway_status' => 'captured',
                    'gateway_payment_id' => $paymentId, 'paid_at' => $paidAt, 'error_code' => 'gateway_cycle_conflict'])->save();
                $lockedOrder->paymentAttempts()->whereKeyNot($lockedAttempt->id)
                    ->whereIn('status', ['processing', 'pending', 'in_process'])
                    ->update(['status' => 'attention_required', 'error_code' => 'gateway_cycle_conflict']);
                $lockedOrder->payment_status = 'attention_required';
                $lockedOrder->paid_at = $paidAt;
                if (! in_array($lockedOrder->status, [DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::Concluido], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_decline_capture_conflict']);
                }
                $lockedOrder->save();

                return false;
            }
            // A slower, older Cielo response must not undo an already observed
            // capture; refunds and chargebacks still follow their own paths.
            if ($lockedOrder->origin === 'stays_existing' && $lockedAttempt->status === 'approved'
                && in_array($status, ['pending', 'authorized', 'rejected', 'expired'], true)) {
                return false;
            }
            if ($status === 'expired' && ($lockedAttempt->status === 'approved' || $lockedOrder->payment_status === 'approved')) {
                return false;
            }
            if ($lockedAttempt->gateway_payment_id !== null && $lockedAttempt->gateway_payment_id !== $paymentId) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_payment_id_conflict'])->save();
                $this->markOrderForAttention($lockedOrder, 'gateway_payment_id_conflict');

                return true;
            }

            $gatewayStatusDetail = $payment['ReturnMessage'] ?? $payment['ReasonMessage'] ?? null;
            $lockedAttempt->forceFill([
                'gateway_payment_id' => $paymentId,
                'fraud_analysis_required' => $lockedAttempt->fraud_analysis_required || $fraudAnalysisRequired,
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
                'error_code' => $fraudReviewRequired ? 'gateway_fraud_analysis_requires_review' : ($status === 'refunded' ? 'gateway_refund_reported' : null),
            ])->save();

            $lockedOrder->gateway_payment_id = $paymentId;
            $lockedOrder->payment_status = $fraudReviewRequired ? 'attention_required' : ($status === 'captured' ? 'approved' : $status);
            $lockedOrder->payment_amount = $lockedAttempt->amount;
            $lockedOrder->payment_currency = $lockedAttempt->currency;
            $lockedOrder->payment_method = $lockedAttempt->payment_method;
            $lockedOrder->payment_detail = $lockedAttempt->payment_method === 'pix' ? 'Pix' : 'CreditCard';
            $lockedOrder->payment_status_detail = is_string($gatewayStatusDetail) ? mb_substr($gatewayStatusDetail, 0, 100) : null;
            $lockedOrder->payment_expires_at = $expiresAt;
            if ($fraudReviewRequired) {
                $lockedOrder->paid_at = $paidAt;
                if (! in_array($lockedOrder->status, [DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::CancelamentoSolicitado, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::Concluido], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_fraud_analysis_requires_review']);
                }
            } elseif ($status === 'captured') {
                $lockedOrder->paid_at = $paidAt;
                $reservationIsStillValid = ($lockedOrder->reservation_status === 'reserved'
                    || ($lockedOrder->origin === 'stays_existing'
                        && config('direct-booking.existing_reservation_checkout_enabled', false)
                        && $lockedOrder->reservation_status === 'booked'))
                    && $lockedOrder->expires_at !== null
                    && $lockedOrder->expires_at->isFuture();
                if ($reservationIsStillValid && in_array($lockedOrder->status, [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::AtencaoOperacional], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::PagoEmConfirmacao, ['source' => 'cielo_authoritative_lookup', 'payment_id' => $paymentId]);
                } elseif (! in_array($lockedOrder->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::Confirmado, DirectBookingOrderStatus::CancelamentoSolicitado, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::Concluido], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_late_or_unreserved_payment', 'payment_id' => $paymentId]);
                }
            } elseif ($status === 'rejected' && $lockedOrder->status === DirectBookingOrderStatus::PagamentoPendente) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoRecusado, ['source' => 'cielo_authoritative_lookup', 'payment_id' => $paymentId]);
            } elseif ($status === 'expired' && in_array($lockedOrder->status, [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::AtencaoOperacional], true)) {
                $lockedOrder->expires_at = now();
                $lockedOrder->transitionTo(DirectBookingOrderStatus::LiberacaoPendente, ['source' => 'cielo_unpaid_pix_expired', 'payment_id' => $paymentId]);
                if ($lockedOrder->origin === 'stays_existing') {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::Expirado, ['source' => 'existing_checkout_expired']);
                }
            } elseif ($attemptStatus === 'attention_required') {
                if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'cielo_authoritative_lookup', 'payment_id' => $paymentId]);
                }
            }

            $lockedOrder->save();

            if ($lockedOrder->origin === 'stays_existing' && $status === 'rejected'
                && $lockedAttempt->payment_method === 'card') {
                app(ExistingReservationPaymentCycleRegistry::class)->closeDeclined($lockedOrder, $lockedAttempt);
            }

            return false;
        };
        $paymentIdConflict = $serializeReservation
            ? app(ExistingReservationPaymentLock::class)->synchronized($canonicalId, $applyState)
            : DB::transaction($applyState);

        $attempt->refresh();
        if ($paymentIdConflict) {
            return $this->result($attempt, 'gateway_payment_id_conflict', 'A tentativa recebeu mais de um identificador de pagamento. A conferência foi interrompida.', 503);
        }

        if ($fraudReviewRequired) {
            return [
                ...$this->result($attempt, 'gateway_fraud_analysis_requires_review', 'O cartão foi processado e exige conferência de segurança. Não realize outro pagamento; acompanhe este pedido ou fale com o atendimento.', 200),
                'gatewayStatus' => $status,
            ];
        }

        $httpStatus = in_array($attempt->status, ['pending', 'approved', 'rejected', 'cancelled', 'expired'], true) ? 201 : 503;

        return [
            ...$this->result($attempt, $attempt->status, $this->paymentMessage($attempt->status), $httpStatus),
            'gatewayStatus' => $order->origin === 'stays_existing' ? $attempt->gateway_status : $status,
        ];
    }

    private function hasAcceptedFraudAnalysis(mixed $analysis): bool
    {
        // Documented ClearSale response: Status=1 and StatusDescription=Accept.
        // Unknown or contradictory response formats require operational review.
        return is_array($analysis)
            && ($analysis['Status'] ?? null) === 1
            && ($analysis['StatusDescription'] ?? null) === 'Accept';
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

    /** Preserve a gateway result already recorded by another worker. */
    private function recordExistingUnknownWithoutRegression(DirectBookingPaymentAttempt $attempt, ?array $diagnostic = null, string $errorCode = 'gateway_result_unknown'): DirectBookingPaymentAttempt
    {
        $order = $attempt->order;
        $canonicalId = $this->serializeReservation($order) ? $this->ensureAttemptReservationId($attempt) : null;
        if ($this->serializeReservation($order) && $canonicalId === null) {
            return $attempt->fresh();
        }

        $update = function () use ($order, $attempt, $diagnostic, $errorCode, $canonicalId): DirectBookingPaymentAttempt {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedOrder->origin !== $order->origin || $lockedOrder->stays_reservation_id !== $order->stays_reservation_id
                || $lockedAttempt->direct_booking_order_id !== $lockedOrder->id
                || ($canonicalId !== null && $this->attemptReservationId($lockedAttempt) !== $canonicalId)) {
                throw new \RuntimeException('Reservation payment identity changed during reconciliation.');
            }
            if (in_array($lockedAttempt->status, ['approved', 'rejected', 'cancelled', 'expired', 'refunded', 'attention_required'], true)
                || in_array($lockedOrder->payment_status, ['approved', 'refunded', 'charged_back'], true)
                || $this->hasAuthoritativePending($lockedAttempt)) {
                return $lockedAttempt;
            }

            $changes = ['status' => $errorCode === 'gateway_result_unknown' ? 'unknown' : 'attention_required', 'error_code' => $errorCode];
            if ($diagnostic !== null) {
                $changes['gateway_status'] = 'unknown';
                $changes['gateway_status_detail'] = json_encode($diagnostic, JSON_THROW_ON_ERROR);
            }
            $lockedAttempt->forceFill($changes)->save();
            $this->markOrderForAttention($lockedOrder, $errorCode);

            return $lockedAttempt->refresh();
        };

        return $this->serializeReservation($order)
            ? app(ExistingReservationPaymentLock::class)->synchronized($canonicalId, $update)
            : DB::transaction($update);
    }

    private function hasAuthoritativePending(DirectBookingPaymentAttempt $attempt): bool
    {
        return in_array($attempt->status, ['pending', 'in_process'], true)
            && in_array($attempt->gateway_status, ['pending', 'authorized'], true)
            && is_string($attempt->gateway_payment_id)
            && preg_match('/^[0-9a-f-]{36}$/iD', $attempt->gateway_payment_id) === 1;
    }

    private function attemptReservationId(DirectBookingPaymentAttempt $attempt): ?string
    {
        $id = $attempt->stays_reservation_canonical_id;
        if ($id === null && $attempt->order->origin === 'stays_existing') {
            $id = $attempt->order->stays_reservation_id;
        }

        return is_string($id) && preg_match('/^[a-f0-9]{24}$/iD', $id) ? strtolower($id) : null;
    }

    /** Backfill old website attempts only after matching the Stays order correlation. */
    private function ensureAttemptReservationId(DirectBookingPaymentAttempt $attempt): ?string
    {
        $id = $this->attemptReservationId($attempt);
        if ($id !== null || $attempt->order->origin !== 'website') {
            return $id;
        }
        $order = $attempt->order;
        $identity = app(StaysReservationIdentity::class)->resolveForLegacyOrder($order);
        if ($identity === null) {
            return null;
        }
        $orderFields = ['origin', 'stays_reservation_id', 'stays_client_id', 'stays_listing_id', 'check_in', 'check_out'];
        $attemptFields = ['direct_booking_order_id', 'gateway_provider', 'gateway_merchant_id', 'merchant_order_id', 'gateway_payment_id', 'payment_method', 'amount', 'currency'];

        return app(ExistingReservationPaymentLock::class)->synchronized($identity['canonical'], function () use ($order, $attempt, $identity, $orderFields, $attemptFields): ?string {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            foreach ($orderFields as $field) {
                if ($lockedOrder->getRawOriginal($field) !== $order->getRawOriginal($field)) {
                    return null;
                }
            }
            foreach ($attemptFields as $field) {
                $actual = $field === 'amount' ? MoneyAmount::toCents($lockedAttempt->amount) : $lockedAttempt->getRawOriginal($field);
                $expected = $field === 'amount' ? MoneyAmount::toCents($attempt->amount) : $attempt->getRawOriginal($field);
                if ($actual !== $expected) {
                    return null;
                }
            }
            if ($lockedAttempt->stays_reservation_canonical_id !== null
                && $lockedAttempt->stays_reservation_canonical_id !== $identity['canonical']) {
                return null;
            }
            $lockedAttempt->forceFill(['stays_reservation_canonical_id' => $identity['canonical']])->save();
            $attempt->setRawAttributes($lockedAttempt->getAttributes(), true);

            return $identity['canonical'];
        });
    }

    private function protectGatewayUnknown(DirectBookingOrder $order): bool
    {
        return $order->origin === 'stays_existing' || app(ReservationCoordinationMode::class)->isRequired($order);
    }

    /** The rollout serializes both origins only after a Stays identity lookup. */
    private function serializeReservation(DirectBookingOrder $order): bool
    {
        return $order->origin === 'stays_existing' || app(ReservationCoordinationMode::class)->isRequired($order);
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

    private function bootstrapApprovalValid(DirectBookingOrder $order): bool
    {
        if ($order->origin !== 'stays_existing') {
            return true;
        }
        $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
        if (! is_array($snapshot) || ($snapshot['bootstrap_receivable'] ?? false) !== true) {
            return true;
        }

        return config('direct-booking.experimental_existing_receivable_creation_enabled', false) === true
            && ($snapshot['_id'] ?? null) === $order->stays_reservation_id
            && ExistingReservationBalanceApproval::approved($snapshot)
            && MoneyAmount::toCents($order->quote_total) === ($snapshot['pending_amount_cents'] ?? null);
    }

    private function paymentMessage(string $status): string
    {
        return match ($status) {
            'approved' => 'Pagamento recebido. A reserva ainda depende de confirmação na Stays.',
            'pending' => 'Pagamento em processamento. A reserva ainda não está confirmada.',
            'rejected' => 'Pagamento não aprovado. O pedido pode aceitar uma nova tentativa enquanto a pré-reserva estiver válida.',
            'cancelled' => 'A tentativa de pagamento foi cancelada.',
            'expired' => 'O Pix venceu sem pagamento. A liberação da pré-reserva será conferida automaticamente.',
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
