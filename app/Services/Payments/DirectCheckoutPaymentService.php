<?php

namespace App\Services\Payments;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Requests\StoreCheckoutPaymentRequest;
use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\DirectStaysReservationService;
use App\Services\MoneyAmount;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class DirectCheckoutPaymentService
{
    public function __construct(
        private readonly MercadoPagoClient $mercadoPago,
        private readonly CieloClient $cielo,
        private readonly DirectStaysReservationService $reservations,
        private readonly CieloCheckoutPaymentService $cieloPayments,
        private readonly CieloSilentOrderPostClient $cieloSop,
    ) {}

    /** @return list<string> */
    public function availableMethods(?DirectBookingOrder $order = null): array
    {
        if (! config('direct-booking.enabled', false)
            || ! config('direct-booking.payments_enabled', false)
            || ! config('direct-booking.confirmation_enabled', false)
            || ! $this->livePaymentsAreAuthorized()
            || DirectBookingOrder::resumeTokenTtlDays() === null
            || ((bool) config('direct-booking.send_confirmation_email', false) && ! $this->hasExternalMailTransport())) {
            return [];
        }

        $paymentProvider = $order?->gateway_provider ?? (string) config('direct-booking.payment_provider', 'mercadopago');
        if (! in_array($paymentProvider, ['mercadopago', 'cielo_sandbox', 'cielo_checkout'], true)) {
            return [];
        }
        if ($paymentProvider === 'cielo_sandbox') {
            if (! $this->cieloPayments->isAvailable()
                || ($order !== null && (! is_string($order->gateway_merchant_id)
                    || ! hash_equals($order->gateway_merchant_id, (string) config('services.cielo.merchant_id'))))) {
                return [];
            }

            return ['card'];
        }
        if ($paymentProvider === 'cielo_checkout') {
            $merchantId = config('services.cielo.checkout_merchant_id');
            if (! $this->hasCieloHostedConfiguration()
                || ($order !== null && (! is_string($merchantId)
                    || ! is_string($order->gateway_merchant_id)
                    || ! hash_equals($merchantId, $order->gateway_merchant_id)))) {
                return [];
            }

            return ['card'];
        }
        if ($paymentProvider !== 'mercadopago') {
            return [];
        }

        $staysPaymentType = config('direct-booking.stays_payment_type');
        $staysPaymentProviderId = config('direct-booking.stays_payment_provider_id');
        $staysClientId = config('services.stays.client_id');
        $staysClientSecret = config('services.stays.client_secret');
        $mercadoPagoAccessToken = config('services.mercadopago.access_token');
        $mercadoPagoWebhookSecret = config('services.mercadopago.webhook_secret');
        $webhookQueueConnection = (string) config('services.mercadopago.webhook_queue_connection', 'database');
        $notificationQueueConnection = (string) config('direct-booking.notification_queue_connection', 'database');
        $holdMinutes = filter_var(config('direct-booking.reservation_hold_minutes'), FILTER_VALIDATE_INT);
        $minimumPixMinutes = (int) config('direct-booking.pix_minimum_remaining_minutes', 30);
        $safetyMarginMinutes = (int) config('direct-booking.payment_safety_margin_minutes', 5);

        if (! in_array($staysPaymentType, ['credit', 'debit'], true)
            || ! is_string($staysPaymentProviderId)
            || trim($staysPaymentProviderId) === ''
            || ! is_string($staysClientId)
            || trim($staysClientId) === ''
            || ! is_string($staysClientSecret)
            || trim($staysClientSecret) === ''
            || ! is_string($mercadoPagoAccessToken)
            || trim($mercadoPagoAccessToken) === ''
            || ! is_string($mercadoPagoWebhookSecret)
            || trim($mercadoPagoWebhookSecret) === ''
            || $webhookQueueConnection === 'sync'
            || ! config("queue.connections.{$webhookQueueConnection}")
            || $notificationQueueConnection === 'sync'
            || ! config("queue.connections.{$notificationQueueConnection}")
            || $holdMinutes === false
            || $holdMinutes > 1440
            || $holdMinutes <= $minimumPixMinutes + $safetyMarginMinutes) {
            return [];
        }

        $methods = ['pix'];
        $mercadoPagoPublicKey = config('services.mercadopago.public_key');
        if (is_string($mercadoPagoPublicKey) && trim($mercadoPagoPublicKey) !== '') {
            $methods[] = 'card';
        }

        return $methods;
    }

    public function createCieloCheckoutPage(DirectBookingOrder $order, string $idempotencyKey): array
    {
        if ($order->gateway_provider !== 'cielo_checkout'
            || ! in_array('card', $this->availableMethods($order), true)) {
            return $this->result(null, 'payments_disabled', 'O pagamento no site ainda não está habilitado.', 503);
        }

        if (! in_array($order->status, [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::PagamentoRecusado], true)
            || $order->stays_reservation_id === null
            || $order->reservation_status !== 'reserved'
            || $order->expires_at === null
            || $order->expires_at->lessThanOrEqualTo(now())) {
            return $this->result(null, 'order_not_payable', 'Este pedido não está disponível para iniciar um novo checkout.', 409);
        }

        $amountInCents = MoneyAmount::toCents($order->quote_total);
        if ($order->currency !== 'BRL' || $amountInCents === null || $amountInCents <= 0) {
            return $this->result(null, 'unsupported_payment_amount', 'O valor ou a moeda do pedido não são compatíveis com o Checkout Cielo.', 422);
        }

        $input = ['paymentMethod' => 'card', 'paymentMethodId' => 'cielo_checkout'];
        $fingerprint = $this->requestFingerprint($input);
        $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existingAttempt !== null) {
            return $this->replay($existingAttempt, $order, $fingerprint);
        }

        $reservationMatches = $this->reservations->validateReservedOrderForPayment($order);
        if ($reservationMatches === null) {
            return $this->result(null, 'reservation_state_unavailable', 'Não foi possível confirmar os dados da pré-reserva na Stays. Nenhum checkout foi criado.', 503);
        }
        if (! $reservationMatches) {
            return $this->result(null, 'stays_reservation_mismatch', 'A pré-reserva não corresponde mais ao pedido. Nenhum checkout foi criado.', 409);
        }

        try {
            $attempt = DB::transaction(function () use ($order, $idempotencyKey, $fingerprint): DirectBookingPaymentAttempt|array {
                $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
                $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
                if ($existingAttempt !== null) {
                    return ['existing' => $existingAttempt];
                }

                $configuredMerchantId = (string) config('services.cielo.checkout_merchant_id');
                if ($lockedOrder->gateway_provider !== 'cielo_checkout'
                    || ! is_string($lockedOrder->gateway_merchant_id)
                    || ! hash_equals($configuredMerchantId, $lockedOrder->gateway_merchant_id)
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
                    'payment_method' => 'card',
                    'payment_method_id' => 'cielo_checkout',
                    'status' => 'processing',
                    'amount' => $lockedOrder->quote_total,
                    'currency' => $lockedOrder->currency,
                    'expires_at' => $lockedOrder->expires_at,
                    'gateway_idempotency_key' => 'CRCN'.Str::upper(Str::random(16)),
                    'gateway_provider' => 'cielo_checkout',
                    'gateway_merchant_id' => $lockedOrder->gateway_merchant_id,
                    'gateway_submission_started_at' => now(),
                    'gateway_submission_count' => 1,
                ]);

                $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoPendente, ['source' => 'cielo_checkout_started']);
                $lockedOrder->payment_status = 'pending';
                $lockedOrder->payment_amount = $lockedOrder->quote_total;
                $lockedOrder->payment_currency = $lockedOrder->currency;
                $lockedOrder->payment_method = 'card';
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

        if (is_array($attempt)) {
            if (isset($attempt['existing'])) {
                return $this->replay($attempt['existing'], $order, $fingerprint);
            }

            return $this->result(null, $attempt['error'], 'Este pedido não está disponível para iniciar um novo checkout.', 409);
        }

        $order->refresh();
        $orderNumber = (string) $attempt->gateway_idempotency_key;
        $listingName = (string) data_get($order->quote_snapshot, 'listingName', 'Hospedagem em Caldas Novas');
        $customer = [
            'FullName' => mb_substr($order->guest_name, 0, 255),
            'Email' => $order->guest_email,
        ];
        $phone = preg_replace('/\D+/', '', $order->guest_phone);
        if (is_string($phone) && $phone !== '') {
            $customer['Phone'] = $phone;
        }
        $sku = preg_replace('/[^A-Za-z0-9]/', '', $order->listing_id);
        $payload = [
            'OrderNumber' => $orderNumber,
            'SoftDescriptor' => 'CRCN CALDAS',
            'Cart' => ['Items' => [[
                'Name' => mb_substr($listingName, 0, 100),
                'Description' => mb_substr('Hospedagem '.$order->check_in->format('d/m/Y').' a '.$order->check_out->format('d/m/Y'), 0, 255),
                'UnitPrice' => $amountInCents,
                'Quantity' => 1,
                'Type' => 'Service',
                'Sku' => is_string($sku) && $sku !== '' ? mb_substr($sku, 0, 16) : 'HOSPEDA',
            ]]],
            'Payment' => ['MaxNumberOfInstallments' => 12],
            'Customer' => $customer,
        ];

        try {
            $checkout = $this->cielo->createCheckoutPage($payload);
            $attempt->forceFill([
                'status' => 'pending',
                'gateway_status' => 'checkout_created',
                'gateway_retry_payload' => ['checkoutUrl' => $checkout['checkoutUrl']],
            ])->save();
        } catch (Throwable) {
            $attempt->forceFill(['status' => 'unknown', 'error_code' => 'cielo_checkout_creation_unknown'])->save();
            $this->markOrderForAttention($order, 'cielo_checkout_creation_unknown');

            return $this->result($attempt->refresh(), 'cielo_checkout_creation_unknown', 'Não foi possível confirmar se a Cielo criou o checkout. O pedido ficará em conferência para evitar uma tentativa duplicada.', 503);
        }

        return $this->result($attempt->refresh(), 'pending', 'Checkout Cielo criado. A reserva só será confirmada após a notificação e validação do pagamento.', 201);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function reconcileCieloCheckoutNotification(string $checkoutOrderNumber, string $merchantOrderNumber): array
    {
        $attempt = DirectBookingPaymentAttempt::query()
            ->where('gateway_provider', 'cielo_checkout')
            ->where('gateway_idempotency_key', $merchantOrderNumber)
            ->first();
        if ($attempt === null || ! preg_match('/^[A-Za-z0-9]{1,32}$/', $checkoutOrderNumber)) {
            return $this->result(null, 'cielo_checkout_order_not_found', 'A notificação não corresponde a um checkout registrado.', 404);
        }

        $order = $attempt->order;
        if ($order === null || $order->gateway_provider !== 'cielo_checkout'
            || ! is_string($order->gateway_merchant_id)
            || ! is_string($attempt->gateway_merchant_id)
            || ! hash_equals($order->gateway_merchant_id, $attempt->gateway_merchant_id)) {
            return $this->result(null, 'cielo_checkout_order_not_found', 'O pedido associado ao checkout não foi encontrado.', 404);
        }

        $response = $this->cielo->getCheckoutOrder($checkoutOrderNumber);
        try {
            $gatewayPayment = $this->normalizeCieloCheckoutPayment($response, $order, $attempt, $checkoutOrderNumber);
        } catch (Throwable) {
            return $this->result($attempt, 'cielo_checkout_payment_mismatch', 'Os dados consultados na Cielo não correspondem ao pedido. A confirmação foi interrompida.', 409);
        }

        return $this->applyGatewayPayment($order, $attempt, $gatewayPayment);
    }

    private function normalizeCieloCheckoutPayment(
        array $response,
        DirectBookingOrder $order,
        DirectBookingPaymentAttempt $attempt,
        string $checkoutOrderNumber,
    ): array {
        $merchantOrderNumber = data_get($response, 'order_number') ?? data_get($response, 'OrderNumber');
        $reportedCheckoutNumber = data_get($response, 'checkout_cielo_order_number') ?? data_get($response, 'Checkout_Cielo_Order_Number');
        $reportedAmount = data_get($response, 'amount') ?? data_get($response, 'Amount');
        $amountInCents = is_numeric($reportedAmount) ? (int) $reportedAmount : null;
        $expectedAmountInCents = MoneyAmount::toCents($attempt->amount);

        if ($merchantOrderNumber !== $attempt->gateway_idempotency_key
            || $reportedCheckoutNumber !== $checkoutOrderNumber
            || $amountInCents === null
            || $amountInCents !== $expectedAmountInCents
            || data_get($response, 'payment_method_type', data_get($response, 'Payment.Type')) !== null
                && ! in_array(data_get($response, 'payment_method_type', data_get($response, 'Payment.Type')), [1, '1', 'CreditCard'], true)) {
            throw new \RuntimeException('Cielo Checkout order details do not match the payment attempt.');
        }

        $rawStatus = data_get($response, 'payment.status') ?? data_get($response, 'payment_status') ?? data_get($response, 'Payment.Status');
        $status = match (is_numeric($rawStatus) ? (int) $rawStatus : mb_strtolower((string) $rawStatus)) {
            1, 'pending' => 'pending',
            2, 'paid' => 'approved',
            3, 'denied' => 'rejected',
            4, 'expired', 5, 'voided' => 'cancelled',
            7, 10, 'authorized', 'authorizedidpaypending' => 'in_process',
            default => 'unknown',
        };

        return [
            'id' => $checkoutOrderNumber,
            'status' => $status,
            'transaction_amount' => number_format($amountInCents / 100, 2, '.', ''),
            'currency_id' => 'BRL',
            'external_reference' => $order->id,
            'payment_method_id' => 'cielo_checkout',
            'status_detail' => is_string($rawStatus) || is_int($rawStatus) ? (string) $rawStatus : null,
            'date_approved' => $status === 'approved' ? now()->toISOString() : null,
        ];
    }

    private function hasCieloHostedConfiguration(): bool
    {
        foreach ([
            'services.cielo.checkout_merchant_id',
            'services.cielo.checkout_sop_client_id',
            'services.cielo.checkout_sop_client_secret',
        ] as $configurationKey) {
            $value = config($configurationKey);
            if (! is_string($value) || trim($value) === '') {
                return false;
            }
        }

        return in_array(config('services.cielo.checkout_environment', 'sandbox'), ['sandbox', 'production'], true);
    }

    private function hasExternalMailTransport(?string $mailerName = null, array $visitedMailers = []): bool
    {
        $mailerName ??= (string) config('mail.default', 'log');
        if ($mailerName === '' || in_array($mailerName, $visitedMailers, true)) {
            return false;
        }

        $mailer = config("mail.mailers.{$mailerName}");
        if (! is_array($mailer) || ! is_string($mailer['transport'] ?? null)) {
            return false;
        }

        $transport = $mailer['transport'];
        if (in_array($transport, ['log', 'array'], true)) {
            return false;
        }

        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            $fallbackMailers = $mailer['mailers'] ?? null;
            if (! is_array($fallbackMailers) || $fallbackMailers === []) {
                return false;
            }

            foreach ($fallbackMailers as $fallbackMailer) {
                if (! is_string($fallbackMailer)
                    || ! $this->hasExternalMailTransport($fallbackMailer, [...$visitedMailers, $mailerName])) {
                    return false;
                }
            }

            return true;
        }

        return in_array($transport, ['smtp', 'sendmail', 'mailgun', 'ses', 'ses-v2', 'postmark', 'resend'], true);
    }

    public function publicKey(?DirectBookingOrder $order = null): ?string
    {
        $publicKey = config('services.mercadopago.public_key');
        if (! in_array('card', $this->availableMethods($order), true)
            || ($order?->gateway_provider ?? config('direct-booking.payment_provider', 'mercadopago')) !== 'mercadopago'
            || ! is_string($publicKey)
            || trim($publicKey) === '') {
            return null;
        }

        return trim($publicKey);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function provider(?DirectBookingOrder $order = null): string
    {
        $provider = $order?->gateway_provider ?? (string) config('direct-booking.payment_provider', 'mercadopago');

        return match ($provider) {
            'mercadopago', 'cielo_sandbox' => $provider,
            'cielo_checkout' => 'cielo_hosted',
            default => 'unavailable',
        };
    }

    public function cieloSopAccessToken(DirectBookingOrder $order): string
    {
        if ($order->gateway_provider !== 'cielo_sandbox'
            || ! in_array('card', $this->availableMethods($order), true)) {
            throw new \RuntimeException('Cielo Silent Order Post is not available for this order.');
        }

        return $this->cieloSop->createBrowserAccessToken();
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool} */
    public function createAttempt(DirectBookingOrder $order, StoreCheckoutPaymentRequest $request): array
    {
        if ($this->availableMethods($order) === []) {
            return $this->result(null, 'payments_disabled', 'O pagamento no site ainda não está habilitado.', 503);
        }

        if ($order->gateway_provider === 'cielo_sandbox') {
            return $this->cieloPayments->createAttempt($order, $request);
        }

        if ($order->gateway_provider !== 'mercadopago') {
            return $this->result(null, 'payment_method_unavailable', 'Este endpoint não processa pagamentos deste provedor.', 503);
        }

        $staysPaymentType = config('direct-booking.stays_payment_type');
        $staysPaymentProviderId = config('direct-booking.stays_payment_provider_id');
        $staysClientId = config('services.stays.client_id');
        $staysClientSecret = config('services.stays.client_secret');
        $mercadoPagoAccessToken = config('services.mercadopago.access_token');
        $mercadoPagoWebhookSecret = config('services.mercadopago.webhook_secret');
        $webhookQueueConnection = (string) config('services.mercadopago.webhook_queue_connection', 'database');

        if (! in_array($staysPaymentType, ['credit', 'debit'], true)
            || ! is_string($staysPaymentProviderId)
            || trim($staysPaymentProviderId) === ''
            || ! is_string($staysClientId)
            || trim($staysClientId) === ''
            || ! is_string($staysClientSecret)
            || trim($staysClientSecret) === ''
            || ! is_string($mercadoPagoAccessToken)
            || trim($mercadoPagoAccessToken) === ''
            || ! is_string($mercadoPagoWebhookSecret)
            || trim($mercadoPagoWebhookSecret) === ''
            || $webhookQueueConnection === 'sync'
            || ! config("queue.connections.{$webhookQueueConnection}")) {
            return $this->result(null, 'payment_configuration_incomplete', 'A configuração necessária para cobrar e confirmar a reserva ainda não está completa.', 503);
        }

        $input = $request->validated();
        if (! in_array($input['paymentMethod'], $this->availableMethods(), true)) {
            return $this->result(null, 'payment_method_unavailable', 'Este método de pagamento ainda não está disponível.', 503);
        }
        if ($input['paymentMethod'] === 'card'
            && mb_strtolower(trim($input['cardholderEmail'])) !== mb_strtolower(trim($order->guest_email))) {
            return $this->result(null, 'cardholder_email_mismatch', 'Use o mesmo e-mail informado no pedido para pagar com cartão.', 422);
        }

        $idempotencyKey = $input['idempotencyKey'];
        $fingerprint = $this->requestFingerprint($input);
        $existingAttempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existingAttempt !== null) {
            return $this->replay($existingAttempt, $order, $fingerprint);
        }

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
        if ($input['paymentMethod'] === 'card') {
            $nameParts = preg_split('/\s+/', trim($input['cardholderName']), 2) ?: [];
            $payer['first_name'] = $nameParts[0] ?? '';
            if (isset($nameParts[1]) && trim($nameParts[1]) !== '') {
                $payer['last_name'] = trim($nameParts[1]);
            }
        }
        $additionalData = [
            'description' => 'Reserva CRCN '.$order->listing_id,
            'payer' => $payer,
        ];
        if ($input['paymentMethod'] === 'pix') {
            $additionalData['date_of_expiration'] = $order->expires_at?->toIso8601String();
        }

        $reservationMatches = $this->reservations->validateReservedOrderForPayment($order);
        if ($reservationMatches === null) {
            return $this->result(null, 'reservation_state_unavailable', 'Não foi possível confirmar os dados da pré-reserva na Stays. Nenhuma cobrança foi iniciada.', 503);
        }
        if (! $reservationMatches) {
            return $this->result(null, 'stays_reservation_mismatch', 'A pré-reserva não corresponde mais ao pedido. Nenhuma cobrança foi iniciada.', 409);
        }

        try {
            $attempt = DB::transaction(function () use ($order, $input, $idempotencyKey, $fingerprint, $methodData, $additionalData): DirectBookingPaymentAttempt|array {
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
                    'expires_at' => $lockedOrder->expires_at,
                    'gateway_idempotency_key' => (string) Str::uuid(),
                    'gateway_retry_payload' => $input['paymentMethod'] === 'pix'
                        ? ['paymentMethodData' => $methodData, 'additionalData' => $additionalData]
                        : null,
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

        try {
            if (! $this->claimInitialGatewaySubmission($attempt)) {
                return $this->result($attempt->refresh(), 'payment_attempt_in_progress', 'A tentativa de pagamento está sendo processada.', 409, replayed: true);
            }

            $createdPayment = $this->mercadoPago->createPayment(
                (string) $order->quote_total,
                $order->id,
                (string) $attempt->gateway_idempotency_key,
                $methodData,
                $additionalData,
            );
            $gatewayId = $createdPayment['id'] ?? null;
            if (! $this->isValidGatewayPaymentId($gatewayId)) {
                throw new \RuntimeException('Mercado Pago did not return a payment identifier.');
            }
            if (! $this->persistGatewayPaymentId($attempt, (string) $gatewayId)) {
                $this->markOrderForAttention($order, 'gateway_payment_id_conflict');

                return $this->result($attempt->refresh(), 'gateway_payment_id_conflict', 'O gateway retornou mais de um pagamento para esta tentativa. A conciliação foi interrompida para conferência.', 503);
            }
            $gatewayPayment = $this->mercadoPago->getPayment($gatewayId);
        } catch (Throwable) {
            $attempt->forceFill([
                'status' => 'unknown',
                'error_code' => 'gateway_result_unknown',
                'gateway_payment_id' => isset($gatewayId) && $this->isValidGatewayPaymentId($gatewayId) ? (string) $gatewayId : null,
            ])->save();
            $this->markOrderForAttention($order, 'gateway_result_unknown');

            return $this->result($attempt->refresh(), 'gateway_result_unknown', 'O resultado da solicitação ao gateway é incerto e será conciliado antes de permitir outra tentativa.', 503);
        }

        return $this->applyGatewayPayment($order, $attempt, $gatewayPayment);
    }

    /** @return array{attempt: DirectBookingPaymentAttempt|null, code: string, message: string, status: int, replayed: bool, gatewayStatus: string|null} */
    public function reconcileGatewayPayment(string $gatewayPaymentId): array
    {
        $persistedAttempt = DirectBookingPaymentAttempt::query()
            ->where('gateway_payment_id', $gatewayPaymentId)
            ->first();
        if ($persistedAttempt?->gateway_provider === 'cielo_sandbox') {
            return $this->cieloPayments->reconcilePaymentId($gatewayPaymentId);
        }
        if ($persistedAttempt !== null && $persistedAttempt->gateway_provider !== 'mercadopago') {
            $persistedAttempt->forceFill([
                'status' => 'attention_required',
                'error_code' => 'unknown_gateway_provider',
            ])->save();
            $this->markOrderForAttention($persistedAttempt->order, 'unknown_gateway_provider');

            return $this->result($persistedAttempt->refresh(), 'unknown_gateway_provider', 'O provedor desta tentativa não é reconhecido e precisa de conferência manual.', 503);
        }

        $gatewayPayment = $this->mercadoPago->getPayment($gatewayPaymentId);
        $attempt = DirectBookingPaymentAttempt::query()
            ->where('gateway_payment_id', $gatewayPaymentId)
            ->where('gateway_provider', 'mercadopago')
            ->first();

        if ($attempt === null && is_string($gatewayPayment['external_reference'] ?? null)) {
            $unlinkedAttempts = DirectBookingPaymentAttempt::query()
                ->where('direct_booking_order_id', $gatewayPayment['external_reference'])
                ->where('gateway_provider', 'mercadopago')
                ->whereNull('gateway_payment_id')
                ->whereIn('status', ['processing', 'pending', 'in_process', 'unknown'])
                ->limit(2)
                ->get();

            if ($unlinkedAttempts->count() === 1) {
                $attempt = $unlinkedAttempts->first();
            }
        }

        if ($attempt === null) {
            throw new \RuntimeException('The payment notification does not match a persisted payment attempt yet.');
        }

        $result = $this->applyGatewayPayment($attempt->order, $attempt, $gatewayPayment);
        $result['gatewayStatus'] = is_string($gatewayPayment['status'] ?? null)
            ? $gatewayPayment['status']
            : null;

        return $result;
    }

    public function reconcileCieloPaymentId(string $gatewayPaymentId): array
    {
        return $this->cieloPayments->reconcilePaymentId($gatewayPaymentId);
    }

    public function reconcileAttempt(DirectBookingPaymentAttempt $attempt): array
    {
        if ($attempt->gateway_provider === 'cielo_sandbox') {
            return $this->cieloPayments->reconcileAttempt($attempt);
        }

        if ($attempt->gateway_provider !== 'mercadopago') {
            $attempt->forceFill([
                'status' => 'attention_required',
                'error_code' => 'unknown_gateway_provider',
            ])->save();
            $this->markOrderForAttention($attempt->order, 'unknown_gateway_provider');

            return ['status' => 503];
        }

        if ($attempt->gateway_payment_id !== null) {
            return $this->reconcileGatewayPayment((string) $attempt->gateway_payment_id);
        }

        return ['status' => $this->markUnsubmittedAttemptRetryable($attempt) ? 200 : 503];
    }

    /** @return array{processed: int, attention: int} */
    public function recoverPendingPayments(): array
    {
        $this->purgeExpiredPixInstructions();

        $hasMercadoPagoCredentials = is_string(config('services.mercadopago.access_token'))
            && trim((string) config('services.mercadopago.access_token')) !== '';

        $staleBefore = now()->subSeconds(max(60, (int) config('direct-booking.payment_reconciliation_interval_seconds', 300)));
        $settledPaymentStaleBefore = now()->subSeconds(max(
            3600,
            (int) config('direct-booking.settled_payment_reconciliation_interval_seconds', 86400),
        ));
        $attempts = DirectBookingPaymentAttempt::query()
            ->where(function ($query) use ($staleBefore, $settledPaymentStaleBefore): void {
                $query->where(function ($query) use ($staleBefore): void {
                    $query->whereIn('status', ['processing', 'pending', 'in_process', 'unknown'])
                        ->where(function ($query) use ($staleBefore): void {
                            $query->where(function ($query) use ($staleBefore): void {
                                $query->whereNotNull('gateway_payment_id')->where('updated_at', '<=', $staleBefore);
                            })->orWhere(function ($query) use ($staleBefore): void {
                                $query->whereNull('gateway_payment_id')
                                    ->whereNotNull('gateway_submission_started_at')
                                    ->where('gateway_submission_started_at', '<=', $staleBefore);
                            })->orWhere(function ($query) use ($staleBefore): void {
                                $query->where('status', 'processing')
                                    ->whereNull('gateway_payment_id')
                                    ->whereNull('gateway_submission_started_at')
                                    ->where('updated_at', '<=', $staleBefore);
                            });
                        });
                })->orWhere(function ($query) use ($settledPaymentStaleBefore): void {
                    $query->whereIn('status', ['approved', 'attention_required'])
                        ->whereIn('gateway_status', ['approved', 'refunded', 'charged_back', 'captured', 'authorized'])
                        ->whereNotNull('gateway_payment_id')
                        ->where('updated_at', '<=', $settledPaymentStaleBefore);
                });
            })
            ->orderBy('updated_at')
            ->orderBy('id')
            ->limit(20)
            ->get();

        $processed = 0;
        $attention = 0;
        foreach ($attempts as $attempt) {
            try {
                if ($attempt->gateway_provider === 'cielo_sandbox') {
                    $result = $this->cieloPayments->reconcileAttempt($attempt);
                } elseif ($attempt->gateway_provider !== 'mercadopago') {
                    $attempt->forceFill([
                        'status' => 'attention_required',
                        'error_code' => 'unknown_gateway_provider',
                    ])->save();
                    $this->markOrderForAttention($attempt->order, 'unknown_gateway_provider');
                    $result = ['status' => 503];
                } elseif (! $hasMercadoPagoCredentials) {
                    continue;
                } elseif ($attempt->gateway_payment_id !== null) {
                    $result = $this->reconcileGatewayPayment((string) $attempt->gateway_payment_id);
                } elseif ($attempt->gateway_submission_started_at === null) {
                    $result = ['status' => $this->markUnsubmittedAttemptRetryable($attempt) ? 200 : 503];
                } else {
                    $result = $this->replayUnknownGatewaySubmission($attempt, $staleBefore);
                }
                $processed++;
                if ($result['status'] >= 500) {
                    $attention++;
                }
            } catch (Throwable) {
                $attempt->forceFill([
                    'updated_at' => now(),
                    'gateway_submission_started_at' => $attempt->gateway_payment_id === null ? now() : $attempt->gateway_submission_started_at,
                ])->save();
                $processed++;
                $attention++;
            }
        }

        $recoverableWebhookProviders = [];
        foreach (['mercadopago', 'cielo_sandbox'] as $provider) {
            $queueConfig = $provider === 'cielo_sandbox'
                ? 'services.cielo.webhook_queue_connection'
                : 'services.mercadopago.webhook_queue_connection';
            $connection = (string) config($queueConfig, 'database');
            if ($connection !== 'sync' && config("queue.connections.{$connection}")) {
                $recoverableWebhookProviders[$provider] = $connection;
            }
        }

        if ($recoverableWebhookProviders !== []) {
            $staleWebhookBefore = now()->subSeconds(max(
                600,
                (int) config('direct-booking.payment_reconciliation_interval_seconds', 300) * 2,
            ));
            $recoverableWebhookStatuses = ['received', 'retrying', 'failed', 'queued', 'processing'];
            $staleWebhooks = DirectBookingPaymentWebhook::query()
                ->whereIn('status', $recoverableWebhookStatuses)
                ->whereIn('gateway_provider', array_keys($recoverableWebhookProviders))
                ->where('reconciliation_attempts', '<', ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS)
                ->where('updated_at', '<=', $staleWebhookBefore)
                ->orderBy('updated_at')
                ->orderBy('id')
                ->limit(20)
                ->get();

            foreach ($staleWebhooks as $webhook) {
                try {
                    $connection = $recoverableWebhookProviders[$webhook->gateway_provider] ?? null;
                    if ($connection === null) {
                        continue;
                    }

                    $claim = DB::transaction(function () use ($webhook, $recoverableWebhookStatuses, $staleWebhookBefore): ?string {
                        $lockedWebhook = DirectBookingPaymentWebhook::query()->lockForUpdate()->findOrFail($webhook->id);
                        $updatedAt = $lockedWebhook->updated_at;
                        if (! in_array($lockedWebhook->status, $recoverableWebhookStatuses, true)
                            || $lockedWebhook->reconciliation_attempts >= ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS
                            || $updatedAt === null
                            || $updatedAt->greaterThan($staleWebhookBefore)) {
                            return null;
                        }

                        $lockedWebhook->forceFill([
                            'status' => 'queued',
                            'error_code' => null,
                        ])->save();

                        return 'queued';
                    });

                    if ($claim !== 'queued') {
                        continue;
                    }

                    if ($webhook->gateway_provider === 'cielo_sandbox') {
                        ReconcileCieloPaymentWebhook::dispatch($webhook->id)->onConnection($connection);
                    } else {
                        ReconcileMercadoPagoPayment::dispatch($webhook->id)->onConnection($connection);
                    }
                    $processed++;
                } catch (Throwable) {
                    $attention++;
                }
            }
        }

        return compact('processed', 'attention');
    }

    private function purgeExpiredPixInstructions(): void
    {
        DirectBookingPaymentAttempt::query()
            ->where('payment_method', 'pix')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->where(function ($query): void {
                $query->whereNotNull('pix_copy_paste')
                    ->orWhereNotNull('pix_qr_code_base64')
                    ->orWhereNotNull('gateway_retry_payload');
            })
            ->update([
                'pix_copy_paste' => null,
                'pix_qr_code_base64' => null,
                'gateway_retry_payload' => null,
                'updated_at' => now(),
            ]);

        DirectBookingOrder::query()
            ->whereNotNull('payment_expires_at')
            ->where('payment_expires_at', '<=', now())
            ->whereNotNull('payment_qr_code')
            ->update([
                'payment_qr_code' => null,
                'updated_at' => now(),
            ]);
    }

    private function claimInitialGatewaySubmission(DirectBookingPaymentAttempt $attempt): bool
    {
        if (! config('direct-booking.enabled', false)
            || ! config('direct-booking.payments_enabled', false)
            || ! config('direct-booking.confirmation_enabled', false)
            || ! $this->livePaymentsAreAuthorized()) {
            return false;
        }

        return DB::transaction(function () use ($attempt): bool {
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedAttempt->status !== 'processing'
                || $lockedAttempt->gateway_payment_id !== null
                || $lockedAttempt->gateway_submission_started_at !== null) {
                return false;
            }

            $lockedAttempt->gateway_submission_started_at = now();
            $lockedAttempt->gateway_submission_count++;
            $lockedAttempt->save();

            return true;
        });
    }

    private function markUnsubmittedAttemptRetryable(DirectBookingPaymentAttempt $attempt): bool
    {
        return DB::transaction(function () use ($attempt): bool {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($attempt->direct_booking_order_id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedAttempt->direct_booking_order_id !== $lockedOrder->id) {
                return false;
            }

            if ($lockedAttempt->status !== 'processing'
                || $lockedAttempt->gateway_payment_id !== null
                || $lockedAttempt->gateway_submission_started_at !== null
                || $lockedOrder->payment_status !== 'pending') {
                return false;
            }

            $lockedAttempt->forceFill(['status' => 'cancelled', 'error_code' => 'gateway_submission_not_started'])->save();
            $lockedOrder->payment_status = 'cancelled';
            if (in_array($lockedOrder->status, [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::AtencaoOperacional], true)) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoRecusado, ['source' => 'gateway_submission_not_started']);
            }
            $lockedOrder->save();

            return true;
        });
    }

    /** @return array{claimed: bool, order: DirectBookingOrder, payload: array<string, mixed>|null} */
    private function claimUnknownPixGatewayRetry(DirectBookingPaymentAttempt $attempt, Carbon $staleBefore): array
    {
        return DB::transaction(function () use ($attempt, $staleBefore): array {
            $order = DirectBookingOrder::query()->lockForUpdate()->findOrFail($attempt->direct_booking_order_id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedAttempt->direct_booking_order_id !== $order->id) {
                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            $retryPayload = $lockedAttempt->gateway_retry_payload;
            $isStale = $lockedAttempt->gateway_submission_started_at !== null
                && $lockedAttempt->gateway_submission_started_at->lessThanOrEqualTo($staleBefore);
            if (! $isStale || $lockedAttempt->gateway_payment_id !== null
                || ! in_array($lockedAttempt->status, ['processing', 'pending', 'in_process', 'unknown'], true)) {
                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            if ($lockedAttempt->gateway_idempotency_key === null) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_idempotency_key_missing'])->save();

                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            if ($lockedAttempt->gateway_submission_count >= 3) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_retry_limit_reached'])->save();

                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            if ($lockedAttempt->payment_method !== 'pix') {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'card_token_not_retained'])->save();

                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            if (! config('direct-booking.enabled', false)
                || ! config('direct-booking.payments_enabled', false)
                || ! config('direct-booking.confirmation_enabled', false)
                || ! $this->livePaymentsAreAuthorized()) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_retry_disabled'])->save();

                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            if (! in_array($order->status, [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::AtencaoOperacional], true)
                || ! in_array($order->payment_status, ['pending', 'unknown'], true)
                || $order->expires_at === null
                || $order->expires_at->isPast()) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_submission_requires_review'])->save();

                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            if (! is_array($retryPayload)
                || ! is_array($retryPayload['paymentMethodData'] ?? null)
                || ! is_array($retryPayload['additionalData'] ?? null)) {
                $lockedAttempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_retry_payload_missing'])->save();

                return ['claimed' => false, 'order' => $order, 'payload' => null];
            }

            $lockedAttempt->gateway_submission_started_at = now();
            $lockedAttempt->gateway_submission_count++;
            $lockedAttempt->save();

            return ['claimed' => true, 'order' => $order, 'payload' => $retryPayload];
        });
    }

    /** @return array{status: int} */
    private function replayUnknownGatewaySubmission(DirectBookingPaymentAttempt $attempt, Carbon $staleBefore): array
    {
        $claim = $this->claimUnknownPixGatewayRetry($attempt, $staleBefore);
        if (! $claim['claimed']) {
            if ($attempt->fresh()?->status === 'attention_required') {
                $this->markOrderForAttention($claim['order'], (string) ($attempt->fresh()?->error_code ?? 'gateway_submission_requires_review'));
            }

            return ['status' => 503];
        }

        $order = $claim['order'];
        if (! is_array($claim['payload'])) {
            $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_retry_payload_missing'])->save();
            $this->markOrderForAttention($order, 'gateway_retry_payload_missing');

            return ['status' => 503];
        }

        $retryPayload = $claim['payload'];

        try {
            $createdPayment = $this->mercadoPago->createPayment(
                (string) $attempt->amount,
                $order->id,
                (string) $attempt->gateway_idempotency_key,
                $retryPayload['paymentMethodData'],
                $retryPayload['additionalData'],
            );
            $gatewayId = $createdPayment['id'] ?? null;
            if (! $this->isValidGatewayPaymentId($gatewayId)) {
                throw new \RuntimeException('Mercado Pago did not return a valid payment identifier.');
            }

            if (! $this->persistGatewayPaymentId($attempt, (string) $gatewayId)) {
                $this->markOrderForAttention($order, 'gateway_payment_id_conflict');

                return ['status' => 503];
            }

            return $this->applyGatewayPayment($order, $attempt, $this->mercadoPago->getPayment($gatewayId));
        } catch (Throwable) {
            $attempt->forceFill(['status' => 'unknown', 'error_code' => 'gateway_result_unknown'])->save();
            $this->markOrderForAttention($order, 'gateway_result_unknown');

            return ['status' => 503];
        }
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
        $gatewayAmountCents = MoneyAmount::toCents($amount);
        $orderAmountCents = MoneyAmount::toCents($order->quote_total);
        $attemptAmountCents = MoneyAmount::toCents($attempt->amount);
        $validGatewayId = $attempt->gateway_provider === 'cielo_checkout'
            ? (is_string($gatewayId) && preg_match('/^[A-Za-z0-9]{1,32}$/', $gatewayId) === 1)
            : $this->isValidGatewayPaymentId($gatewayId);
        if (! $validGatewayId
            || ! is_string($status)
            || $gatewayAmountCents === null
            || $orderAmountCents === null
            || $attemptAmountCents !== $orderAmountCents
            || $gatewayAmountCents !== $orderAmountCents
            || $currency !== $order->currency
            || $externalReference !== $order->id
            || ! is_string($gatewayPayment['payment_method_id'] ?? null)
            || $gatewayPayment['payment_method_id'] !== $attempt->payment_method_id) {
            $attempt->forceFill(['status' => 'attention_required', 'error_code' => 'gateway_payment_mismatch'])->save();
            $this->markOrderForAttention($order, 'gateway_payment_mismatch');

            return $this->result($attempt->refresh(), 'gateway_payment_mismatch', 'O gateway retornou dados que não correspondem ao pedido. A confirmação foi interrompida.', 503);
        }

        $transactionData = data_get($gatewayPayment, 'point_of_interaction.transaction_data', []);
        $expiresAt = $this->parseDate($gatewayPayment['date_of_expiration'] ?? null) ?? $order->expires_at;
        $paidAt = $status === 'approved' ? ($this->parseDate($gatewayPayment['date_approved'] ?? null) ?? now()) : null;
        $gatewayUpdatedAt = $this->parseDate($gatewayPayment['date_last_updated'] ?? null);
        $pixInstructionsAreCurrent = $attempt->payment_method === 'pix'
            && in_array($status, ['pending', 'in_process'], true)
            && $expiresAt?->isFuture() === true;
        $attemptStatus = match ($status) {
            'approved' => 'approved',
            'pending' => 'pending',
            'in_process' => 'in_process',
            'rejected' => 'rejected',
            'cancelled' => 'cancelled',
            'refunded', 'charged_back' => 'attention_required',
            default => 'unknown',
        };
        $eventSource = match ($attempt->gateway_provider) {
            'cielo_checkout' => 'cielo_checkout_authoritative_lookup',
            'cielo_sandbox', 'cielo' => 'cielo_authoritative_lookup',
            default => 'mercadopago_authoritative_lookup',
        };

        $gatewayPaymentIdConflict = DB::transaction(function () use ($order, $attempt, $gatewayPayment, $gatewayId, $status, $attemptStatus, $expiresAt, $paidAt, $gatewayUpdatedAt, $transactionData, $pixInstructionsAreCurrent, $eventSource): bool {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedAttempt->gateway_payment_id !== null && $lockedAttempt->gateway_payment_id !== (string) $gatewayId) {
                $preserveOrderStatus = in_array($lockedOrder->status, [
                    DirectBookingOrderStatus::ReembolsoPendente,
                    DirectBookingOrderStatus::Reembolsado,
                    DirectBookingOrderStatus::Contestado,
                    DirectBookingOrderStatus::Concluido,
                ], true);
                if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional && ! $preserveOrderStatus) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, [
                        'source' => 'payment_gateway',
                        'code' => 'gateway_payment_id_conflict',
                        'payment_id' => (string) $gatewayId,
                    ]);
                } else {
                    $events = $lockedOrder->operational_events ?? [];
                    $lastEvent = $events[array_key_last($events)] ?? null;
                    if (($lastEvent['code'] ?? null) !== 'gateway_payment_id_conflict' || ($lastEvent['payment_id'] ?? null) !== (string) $gatewayId) {
                        $events[] = [
                            'source' => 'payment_gateway',
                            'code' => 'gateway_payment_id_conflict',
                            'payment_id' => (string) $gatewayId,
                            'status' => $lockedOrder->status->value,
                            'at' => now()->toISOString(),
                        ];
                        $lockedOrder->operational_events = $events;
                    }
                }
                if (! in_array($lockedOrder->payment_status, ['approved', 'refunded', 'charged_back'], true)) {
                    $lockedOrder->payment_status = 'unknown';
                }
                $lockedOrder->save();

                return true;
            }

            $terminalGatewayStatusAdvanced = in_array($lockedAttempt->gateway_status, ['refunded', 'charged_back'], true)
                && in_array($status, ['refunded', 'charged_back'], true)
                && $lockedAttempt->gateway_status !== $status
                && $gatewayUpdatedAt !== null
                && $lockedAttempt->gateway_updated_at !== null
                && $gatewayUpdatedAt->greaterThan($lockedAttempt->gateway_updated_at);
            if (($gatewayUpdatedAt !== null && $lockedAttempt->gateway_updated_at !== null && $gatewayUpdatedAt->lessThan($lockedAttempt->gateway_updated_at))
                || ($this->isGatewayStatusRegression($lockedAttempt->gateway_status, $status) && ! $terminalGatewayStatusAdvanced)) {
                return false;
            }

            $previousGatewayStatus = $lockedAttempt->gateway_status;

            $lockedAttempt->forceFill([
                'gateway_payment_id' => (string) $gatewayId,
                'status' => $attemptStatus,
                'gateway_status' => $status,
                'gateway_status_detail' => $gatewayPayment['status_detail'] ?? null,
                'payment_method_detail' => $gatewayPayment['payment_method_id'] ?? null,
                'expires_at' => $expiresAt,
                'paid_at' => $paidAt,
                'gateway_updated_at' => $gatewayUpdatedAt ?? $lockedAttempt->gateway_updated_at,
                'pix_copy_paste' => $pixInstructionsAreCurrent ? data_get($transactionData, 'qr_code') : null,
                'pix_qr_code_base64' => $pixInstructionsAreCurrent ? data_get($transactionData, 'qr_code_base64') : null,
                'error_code' => $status === 'charged_back' ? 'gateway_chargeback_reported' : null,
            ])->save();

            $lockedOrder->gateway_payment_id = (string) $gatewayId;
            $lockedOrder->payment_status = $status;
            $lockedOrder->payment_amount = $lockedAttempt->amount;
            $lockedOrder->payment_currency = $lockedAttempt->currency;
            $lockedOrder->payment_method = $lockedAttempt->payment_method;
            $lockedOrder->payment_detail = $gatewayPayment['payment_method_id'] ?? null;
            $lockedOrder->payment_status_detail = $gatewayPayment['status_detail'] ?? null;
            $lockedOrder->payment_expires_at = $expiresAt;
            $lockedOrder->payment_qr_code = $pixInstructionsAreCurrent ? data_get($transactionData, 'qr_code') : null;

            if ($status === 'approved') {
                $lockedOrder->paid_at = $paidAt;
                $reservationIsStillValid = $lockedOrder->reservation_status === 'reserved'
                    && $lockedOrder->expires_at !== null
                    && $lockedOrder->expires_at->isFuture();
                if ($reservationIsStillValid && in_array($lockedOrder->status, [
                    DirectBookingOrderStatus::PagamentoPendente,
                    DirectBookingOrderStatus::AtencaoOperacional,
                ], true)) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::PagoEmConfirmacao, ['source' => $eventSource, 'payment_id' => (string) $gatewayId]);
                } elseif (! in_array($lockedOrder->status, [
                    DirectBookingOrderStatus::PagoEmConfirmacao,
                    DirectBookingOrderStatus::Confirmado,
                    DirectBookingOrderStatus::CancelamentoSolicitado,
                    DirectBookingOrderStatus::ReembolsoPendente,
                    DirectBookingOrderStatus::Reembolsado,
                    DirectBookingOrderStatus::Contestado,
                    DirectBookingOrderStatus::Concluido,
                ], true)) {
                    $attentionEvent = [
                        'source' => 'late_or_unreserved_payment',
                        'code' => 'payment_approved_after_hold',
                        'payment_id' => (string) $gatewayId,
                    ];
                    if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                        $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, $attentionEvent);
                    } else {
                        $events = $lockedOrder->operational_events ?? [];
                        $lastEvent = $events[array_key_last($events)] ?? null;
                        if (($lastEvent['code'] ?? null) !== $attentionEvent['code'] || ($lastEvent['payment_id'] ?? null) !== $attentionEvent['payment_id']) {
                            $events[] = [...$attentionEvent, 'status' => DirectBookingOrderStatus::AtencaoOperacional->value, 'at' => now()->toISOString()];
                            $lockedOrder->operational_events = $events;
                        }
                    }
                }
            } elseif ($status === 'refunded'
                && in_array($lockedOrder->status, [DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado], true)) {
                $events = $lockedOrder->operational_events ?? [];
                $staysCancellationVerified = collect($events)->contains(fn (mixed $event): bool => is_array($event)
                    && ($event['code'] ?? null) === 'stays_cancellation_verified');

                if ($lockedOrder->status === DirectBookingOrderStatus::ReembolsoPendente
                    && $lockedOrder->reservation_status === 'canceled'
                    && $staysCancellationVerified) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::Reembolsado, [
                        'source' => 'manual_cancellation_steps_verified',
                        'code' => 'stays_cancellation_and_gateway_refund_verified',
                    ]);
                    $events = $lockedOrder->operational_events ?? [];
                }

                $gatewayRefundAlreadyRecorded = collect($events)->contains(fn (mixed $event): bool => is_array($event)
                    && ($event['code'] ?? null) === 'gateway_refund_verified');
                if (! $gatewayRefundAlreadyRecorded) {
                    $events[] = [
                        'source' => $eventSource,
                        'event' => 'gateway_refund_verified',
                        'code' => 'gateway_refund_verified',
                        'payment_id' => (string) $gatewayId,
                        'status' => $lockedOrder->status->value,
                        'at' => now()->toISOString(),
                    ];
                }
                $lockedOrder->operational_events = $events;
            } elseif (in_array($status, ['rejected', 'cancelled'], true) && $lockedOrder->status === DirectBookingOrderStatus::PagamentoPendente) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::PagamentoRecusado, ['source' => $eventSource, 'payment_id' => (string) $gatewayId]);
            } elseif ($status === 'charged_back' && $lockedOrder->status !== DirectBookingOrderStatus::Contestado) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::Contestado, [
                    'source' => $eventSource,
                    'code' => 'gateway_chargeback_reported',
                    'payment_id' => (string) $gatewayId,
                ]);
            } elseif ($attemptStatus === 'unknown' || ($attemptStatus === 'attention_required' && $status !== 'charged_back')) {
                $preserveOrderStatus = in_array($lockedOrder->status, [
                    DirectBookingOrderStatus::ReembolsoPendente,
                    DirectBookingOrderStatus::Reembolsado,
                    DirectBookingOrderStatus::Contestado,
                    DirectBookingOrderStatus::Concluido,
                ], true);
                if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional && ! $preserveOrderStatus) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => $eventSource, 'payment_id' => (string) $gatewayId]);
                } elseif ($preserveOrderStatus) {
                    $events = $lockedOrder->operational_events ?? [];
                    $lastEvent = $events[array_key_last($events)] ?? null;
                    if (($lastEvent['event'] ?? null) !== 'payment_gateway_attention'
                        || ($lastEvent['payment_id'] ?? null) !== (string) $gatewayId) {
                        $events[] = [
                            'event' => 'payment_gateway_attention',
                            'source' => $eventSource,
                            'code' => 'gateway_status_requires_review',
                            'payment_id' => (string) $gatewayId,
                            'status' => $lockedOrder->status->value,
                            'at' => now()->toISOString(),
                        ];
                        $lockedOrder->operational_events = $events;
                    }
                }
            }

            if ($terminalGatewayStatusAdvanced) {
                $events = $lockedOrder->operational_events ?? [];
                $events[] = [
                    'source' => $eventSource,
                    'event' => 'gateway_terminal_status_updated',
                    'code' => 'gateway_terminal_status_updated',
                    'previous_gateway_status' => $previousGatewayStatus,
                    'gateway_status' => $status,
                    'payment_id' => (string) $gatewayId,
                    'gateway_updated_at' => $gatewayUpdatedAt->toISOString(),
                    'status' => $lockedOrder->status->value,
                    'at' => now()->toISOString(),
                ];
                $lockedOrder->operational_events = $events;
            }

            $lockedOrder->save();

            return false;
        });

        $attempt = $attempt->refresh();
        if ($gatewayPaymentIdConflict) {
            return $this->result($attempt, 'gateway_payment_id_conflict', 'O gateway retornou mais de um pagamento para esta tentativa. A conciliação foi interrompida para conferência.', 503);
        }

        $currentAttemptStatus = $attempt->status;
        $httpStatus = in_array($currentAttemptStatus, ['pending', 'in_process', 'approved', 'rejected', 'cancelled'], true) ? 201 : 503;

        return $this->result($attempt, $currentAttemptStatus, $this->paymentMessage($currentAttemptStatus), $httpStatus);
    }

    private function isGatewayStatusRegression(?string $currentStatus, string $incomingStatus): bool
    {
        if ($currentStatus === null || $currentStatus === $incomingStatus) {
            return false;
        }

        if ($currentStatus === 'in_process' && $incomingStatus === 'pending') {
            return true;
        }

        if ($currentStatus === 'approved') {
            return ! in_array($incomingStatus, ['refunded', 'charged_back'], true);
        }

        if (in_array($currentStatus, ['refunded', 'charged_back'], true)) {
            return true;
        }

        if (in_array($currentStatus, ['rejected', 'cancelled'], true)) {
            return ! in_array($incomingStatus, ['approved', 'refunded', 'charged_back'], true);
        }

        return false;
    }

    private function persistGatewayPaymentId(DirectBookingPaymentAttempt $attempt, string $gatewayPaymentId): bool
    {
        return DB::transaction(function () use ($attempt, $gatewayPaymentId): bool {
            $lockedAttempt = DirectBookingPaymentAttempt::query()->lockForUpdate()->findOrFail($attempt->id);
            if ($lockedAttempt->gateway_payment_id !== null && $lockedAttempt->gateway_payment_id !== $gatewayPaymentId) {
                return false;
            }

            $lockedAttempt->forceFill([
                'gateway_payment_id' => $gatewayPaymentId,
                'gateway_retry_payload' => null,
            ])->save();

            return true;
        });
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
                if (in_array($lockedOrder->status, [
                    DirectBookingOrderStatus::ReembolsoPendente,
                    DirectBookingOrderStatus::Reembolsado,
                    DirectBookingOrderStatus::Contestado,
                    DirectBookingOrderStatus::Concluido,
                ], true)) {
                    $events = $lockedOrder->operational_events ?? [];
                    $lastEvent = $events[array_key_last($events)] ?? null;
                    if (($lastEvent['event'] ?? null) !== 'payment_gateway_attention'
                        || ($lastEvent['code'] ?? null) !== $code) {
                        $events[] = [
                            'event' => 'payment_gateway_attention',
                            'source' => 'payment_gateway',
                            'code' => $code,
                            'status' => $lockedOrder->status->value,
                            'at' => now()->toISOString(),
                        ];
                        $lockedOrder->operational_events = $events;
                    }
                } else {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'payment_gateway', 'code' => $code]);
                }
            }
            if (! in_array($lockedOrder->payment_status, ['approved', 'refunded', 'charged_back'], true)) {
                $lockedOrder->payment_status = 'unknown';
            }
            $lockedOrder->save();
        });
    }

    private function livePaymentsAreAuthorized(): bool
    {
        return ! app()->isProduction() || (bool) config('direct-booking.live_payments_enabled', false);
    }

    private function isValidGatewayPaymentId(mixed $gatewayId): bool
    {
        return (is_int($gatewayId) && $gatewayId > 0)
            || (is_string($gatewayId) && preg_match('/^[0-9]*[1-9][0-9]*$/D', $gatewayId) === 1);
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
