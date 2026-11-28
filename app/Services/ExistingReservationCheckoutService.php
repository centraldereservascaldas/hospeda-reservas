<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\CieloEcommerceClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ExistingReservationCheckoutService
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly ExistingReservationBalance $balance,
        private readonly ExistingReservationPaymentChannels $channels,
        private readonly DirectCheckoutPaymentService $payments,
        private readonly CieloEcommerceClient $cielo,
        private readonly ApartmentGuestCapacity $guestCapacity,
    ) {}

    /** @param array<string, mixed> $input
     * @return array{order: DirectBookingOrder|null, code: string, status: int}
     */
    public function create(string $code, array $input): array
    {
        if (! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return $this->result(null, 'reservation_not_found', 404);
        }
        $plan = $input['paymentPlan'] ?? null;
        $fingerprintData = [
            $code,
            $input['expectedBalanceCents'],
            $input['guest'],
            $input['paymentMethod'],
            $input['paymentMethod'] === 'card' ? (int) $input['installments'] : null,
            true,
        ];
        if ($plan !== null) {
            $fingerprintData[] = $plan;
        }
        if (isset($input['acceptedContract'])) {
            $fingerprintData[] = $input['acceptedContract'];
        }
        if (isset($input['recoverySecret'])) {
            $fingerprintData[] = hash_hmac('sha256', $input['recoverySecret'], (string) config('app.key'));
        }
        $fingerprint = hash_hmac('sha256', json_encode($fingerprintData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
        $existing = DirectBookingOrder::query()->where('idempotency_key', $input['idempotencyKey'])->first();
        if ($existing !== null) {
            if ($existing->origin !== 'stays_existing' || ! hash_equals($existing->request_fingerprint, $fingerprint)
                || ! $existing->hasValidResumeToken($existing->resume_token ?? '')) {
                return $this->result(null, 'existing_checkout_unavailable', 409);
            }

            // Returning the protected resume token must not depend on a gateway outage or
            // a feature switch. This path performs no external writes and cannot initiate a payment.
            if (! $this->canCreateCheckout()
                || ! in_array($input['paymentMethod'], $this->channels->availableMethods($this->payments->availableMethods($existing)), true)
                || ! is_string($existing->gateway_merchant_id)
                || ! hash_equals($existing->gateway_merchant_id, (string) $this->cielo->merchantId())
                || ! app(ExistingReservationPaymentPlanPolicy::class)->canStartOrderPayment($existing, $input['paymentMethod'])) {
                return $this->result($existing, 'existing_checkout_replay_only', 200);
            }

            return $this->completeUnrecordedReceivable($existing, $input, 200);
        }

        $guestErrors = [];
        if (! isset($input['guest']['cpf']) || ! BrazilianTaxId::isValid('CPF', $input['guest']['cpf'])) {
            $guestErrors['guest.cpf'] = 'Informe um CPF válido do titular da reserva.';
        }
        $normalizedPhone = BrazilianPhone::normalize($input['guest']['phone']);
        if ($normalizedPhone === null) {
            $guestErrors['guest.phone'] = 'Informe um telefone brasileiro válido com DDD.';
        }
        if ($guestErrors !== []) {
            throw ValidationException::withMessages($guestErrors);
        }

        if (! isset($input['acceptedContract'])) {
            return $this->result(null, 'existing_contract_required', 409);
        }

        $contract = null;
        if (isset($input['acceptedContract'])) {
            $contract = app(LegalPageRegistry::class)->find('contrato');
            if (! is_array($contract) || $contract['version'] !== $input['acceptedContract']['version']
                || ! hash_equals(hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), $input['acceptedContract']['contentHash'])) {
                return $this->result(null, 'existing_contract_changed', 409);
            }
        }

        if (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true
            && config('direct-booking.experimental_existing_ledger_audit_enabled', false) !== true) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        if (! config('direct-booking.enabled', false) || ! config('direct-booking.existing_reservation_checkout_enabled', false)
            || ! CieloDirectConfiguration::isProvider((string) config('direct-booking.payment_provider'))
            || $this->channels->availableMethods($this->payments->availableMethods()) === [] || $this->cielo->merchantId() === null) {
            return $this->result(null, 'existing_checkout_disabled', 503);
        }
        if ($plan === 'deposit' && (config('direct-booking.experimental_existing_deposit_enabled', false) !== true || $input['paymentMethod'] !== 'pix')) {
            return $this->result(null, 'existing_deposit_unavailable', 409);
        }

        $reservation = $this->stays->get('/booking/reservations/'.$code);
        $payments = $this->stays->get('/booking/reservations/'.$code.'/payments');
        if (! is_array($reservation) || ! is_array($payments)
            || ! in_array($reservation['type'] ?? null, ['reserved', 'booked'], true)) {
            return $this->result(null, 'existing_reservation_unavailable', 503);
        }
        $candidate = $this->balance->inspect($reservation, $payments);
        if ($candidate['status'] === 'pending_candidate'
            && app(ExistingReservationBootstrapOrigin::class)->requiresReview($reservation['_id'] ?? null, $payments, $candidate['payment_id'])) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        $bootstrap = $candidate['status'] === 'unrecorded_candidate';
        $reportedPaid = $this->balance->reportedPaid($reservation);
        $hasVerifiedPartialPayment = ($reportedPaid['present'] ?? false) === true
            && is_int($reportedPaid['cents'] ?? null) && $reportedPaid['cents'] > 0;
        if (($reservation['type'] ?? null) === 'booked' && ! $hasVerifiedPartialPayment
            && $candidate['status'] !== 'pending_candidate') {
            return $this->result(null, 'existing_reservation_unavailable', 503);
        }
        if ($bootstrap && ($reportedPaid === null || ! $reportedPaid['present'] || ! is_int($reportedPaid['cents']))) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        if (($reservation['id'] ?? null) !== $code || (! $bootstrap && $candidate['status'] !== 'pending_candidate')
            || $candidate['candidate_cents'] !== $input['expectedBalanceCents']) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        if ($plan === null || $plan === 'full') {
            if (! app(ExistingReservationPaymentPlanPolicy::class)->fullBalanceMatches($reservation, $candidate, $reportedPaid)) {
                return $this->result(null, 'existing_balance_unverified', 409);
            }
        }
        if ($plan === 'deposit' && ! app(ExistingReservationPaymentPlanPolicy::class)->depositMatches($reservation, $candidate, $reportedPaid)) {
            return $this->result(null, 'existing_deposit_unavailable', 409);
        }
        $detailsValidator = app(ExistingReservationCheckoutDetails::class);
        if (! $detailsValidator->validGuests($reservation)) {
            return $this->result(null, 'existing_guest_details_unverified', 409);
        }
        if (! $detailsValidator->validIdentity($reservation)) {
            return $this->result(null, 'existing_reservation_unverified', 409);
        }
        $details = is_array($reservation['guestsDetails'] ?? null) ? $reservation['guestsDetails'] : [];
        $guests = [];
        foreach (['adults', 'children', 'infants'] as $type) {
            $value = $details[$type] ?? null;
            if (! is_int($value) || $value < 0 || $value > 50) {
                return $this->result(null, 'existing_guest_details_unverified', 409);
            }
            $guests[$type] = $value;
        }
        $guests['pets'] = 0;
        $snapshot = [];
        foreach (['_id', '_idclient', '_idlisting', 'checkInDate', 'checkOutDate'] as $field) {
            if (! is_string($reservation[$field] ?? null) || $reservation[$field] === '') {
                return $this->result(null, 'existing_reservation_unverified', 409);
            }
            $snapshot[$field] = $reservation[$field];
        }
        if (! preg_match('/^[a-f0-9]{24}$/iD', $snapshot['_id'])) {
            return $this->result(null, 'existing_reservation_unverified', 409);
        }
        if (! app(StaysReservationIdentity::class)->remember(['canonical' => strtolower($snapshot['_id']), 'code' => $code])) {
            return $this->result(null, 'existing_reservation_unverified', 409);
        }
        $snapshot['reservation_code'] = $code;
        $snapshot['apartment_max_guests'] = $this->guestCapacity->forListingId($snapshot['_idlisting']);
        $snapshot['guests'] = $reservation['guests'] ?? null;
        $reportedPaid = $this->balance->reportedPaid($reservation);
        if ($reportedPaid === null) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        $snapshot['reported_paid_present'] = $reportedPaid['present'];
        $snapshot['reported_paid_cents'] = $reportedPaid['cents'];
        $snapshot['reservation_type'] = $reservation['type'] ?? null;
        $snapshot['partner_name'] = is_string($reservation['partner']['name'] ?? null) ? mb_strtolower(trim($reservation['partner']['name'])) : null;
        $snapshot['reservation_total_cents'] = MoneyAmount::toCents($reservation['price']['_f_total'] ?? null);
        if ($bootstrap) {
            $snapshot['outstanding_balance_cents'] = $candidate['candidate_cents'];
        } else {
            $snapshot['receivable_amount_cents'] = $candidate['candidate_cents'];
        }
        $snapshot['pending_amount_cents'] = $plan === 'deposit'
            ? intdiv($snapshot['reservation_total_cents'] + 1, 2) : $candidate['candidate_cents'];
        $snapshot['currency'] = 'BRL';
        $snapshot['payment_id'] = $candidate['payment_id'];
        $snapshot['bootstrap_receivable'] = $bootstrap;
        $snapshot['channel_provider_ids'] = $this->channels->snapshot();
        $method = $input['paymentMethod'];
        $installments = $method === 'card' ? (int) $input['installments'] : null;
        if ($plan !== null) {
            $snapshot['payment_plan'] = $plan;
        }
        $snapshot['selected_payment_method'] = $method;
        $snapshot['selected_installments'] = $installments;
        $pending = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === $candidate['payment_id']));
        $provider = $this->channels->verifiedProvider($snapshot['channel_provider_ids'], $method, $installments);
        if (! in_array($method, $this->channels->availableMethods($this->payments->availableMethods()), true)
            || $provider === null || (! $bootstrap && (count($pending) !== 1
                || ($pending[0]['_idpaymentProvider'] ?? null) !== $provider))) {
            return $this->result(null, 'existing_payment_channel_unavailable', 503);
        }
        $snapshot['pending_provider_id'] = $provider;
        $snapshot['receivable_creation_timing'] = $bootstrap ? 'after_capture' : 'existing_pending';
        if (! $this->ledgerAllows($snapshot)) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        if (! is_int($snapshot['guests']) || $snapshot['guests'] !== $guests['adults'] + $guests['children'] + $guests['infants']
            || ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $snapshot['checkInDate'])
            || ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $snapshot['checkOutDate'])) {
            return $this->result(null, 'existing_reservation_unverified', 409);
        }
        $ttl = DirectBookingOrder::resumeTokenTtlDays();
        if ($ttl === null) {
            return $this->result(null, 'existing_checkout_unavailable', 503);
        }

        $merchantId = $this->cielo->merchantId();
        $cyclePreparation = app(ExistingReservationPaymentCycleRegistry::class)->prepare($snapshot['_id']);
        try {
            $created = app(ExistingReservationPaymentLock::class)->synchronized($snapshot['_id'], function () use ($code, $input, $fingerprint, $ttl, $snapshot, $reservation, $guests, $candidate, $merchantId, $cyclePreparation, $contract, $normalizedPhone, $plan): array {
                if (isset($input['recoverySecret'])) {
                    $recoveryHash = app(ExistingCheckoutRecoveryCredential::class)->hash($input['recoverySecret']);
                    $credential = DB::table('existing_checkout_recovery_credentials')->where('credential_hash', $recoveryHash)->lockForUpdate()->first();
                    if (! $credential || $credential->reservation_code !== $code || $credential->state !== 'issued'
                        || app(ExistingCheckoutRecoveryCredential::class)->expired($credential->created_at)) {
                        return ['order' => null, 'code' => 'existing_checkout_recovery_revoked', 'status' => 409];
                    }
                }
                if (app(ReservationReleaseGuard::class)->paymentBlocked(strtolower($snapshot['_id']), $reservation['id'])) {
                    return ['order' => null, 'code' => 'existing_checkout_unavailable', 'status' => 409];
                }
                $existing = DirectBookingOrder::query()->where('idempotency_key', $input['idempotencyKey'])->first();
                if ($existing !== null) {
                    if ($existing->origin !== 'stays_existing' || ! hash_equals($existing->request_fingerprint, $fingerprint)
                        || ! $existing->hasValidResumeToken($existing->resume_token ?? '')) {
                        return ['order' => null, 'code' => 'existing_checkout_unavailable', 'status' => 409];
                    }

                    return ['order' => $existing, 'code' => 'existing_checkout_ready', 'status' => 200];
                }
                $canonicalReservationId = strtolower($snapshot['_id']);
                $activeAttempts = DirectBookingPaymentAttempt::query()
                    ->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])
                    ->whereHas('order', fn ($query) => $query
                        ->where('origin', 'stays_existing')
                        ->where(fn ($identity) => $identity->whereRaw('LOWER(stays_reservation_id) = ?', [$canonicalReservationId])
                            ->orWhere('stays_reservation_id', $code)))
                    ->with('order')
                    ->orderByDesc('created_at')
                    ->orderByDesc('id')
                    ->get();
                $verifiedSettlements = is_array($cyclePreparation['verified'] ?? null) ? $cyclePreparation['verified'] : [];
                $activeAttempt = $activeAttempts->first(fn (DirectBookingPaymentAttempt $attempt): bool => $attempt->status !== 'approved' || ! isset($verifiedSettlements[$attempt->id]));
                if ($activeAttempt !== null) {
                    // A new key must never be acknowledged without a durable binding.
                    // The original key can still resume its own order through the lookup above.
                    return ['order' => null, 'code' => 'existing_checkout_already_started', 'status' => 409];
                }
                $existingOrder = DirectBookingOrder::query()
                    ->where('origin', 'stays_existing')
                    ->where(fn ($identity) => $identity->whereRaw('LOWER(stays_reservation_id) = ?', [$canonicalReservationId])
                        ->orWhere('stays_reservation_id', $code))
                    ->orderByDesc('created_at')
                    ->orderByDesc('id')
                    ->lockForUpdate()
                    ->first();
                if ($existingOrder !== null) {
                    $lastAttempt = $existingOrder->paymentAttempts()
                        ->orderByDesc('created_at')
                        ->orderByDesc('id')
                        ->first();
                    $sameBalance = MoneyAmount::toCents($existingOrder->quote_total) === $snapshot['pending_amount_cents'];
                    $orderExpired = $existingOrder->status === DirectBookingOrderStatus::Expirado
                        || $existingOrder->expires_at?->isPast() === true;
                    $retryable = $existingOrder->status === DirectBookingOrderStatus::PagamentoRecusado
                        && in_array($existingOrder->payment_status, ['rejected', 'cancelled'], true)
                        && $lastAttempt !== null
                        && in_array($lastAttempt->status, ['rejected', 'cancelled'], true);
                    $previousSnapshot = is_array($existingOrder->quote_snapshot)
                        ? ($existingOrder->quote_snapshot['existing_reservation'] ?? null)
                        : null;
                    $currentAudit = is_array($cyclePreparation['currentAudit'] ?? null)
                        ? $cyclePreparation['currentAudit']
                        : null;
                    $previousReportedPaid = is_array($previousSnapshot) && is_int($previousSnapshot['reported_paid_cents'] ?? null)
                        ? $previousSnapshot['reported_paid_cents']
                        : null;
                    $previousPendingAmount = is_array($previousSnapshot) && is_int($previousSnapshot['pending_amount_cents'] ?? null)
                        ? $previousSnapshot['pending_amount_cents']
                        : null;
                    $currentAuditMatchesCandidate = $currentAudit !== null
                        && (($candidate['status'] ?? null) === 'unrecorded_candidate'
                            ? ($currentAudit['pending_payment_id'] ?? null) === null
                                && ($currentAudit['pending_cents'] ?? null) === null
                                && ($currentAudit['balance_cents'] ?? null) === $candidate['candidate_cents']
                            : ($candidate['status'] ?? null) === 'pending_candidate'
                                && ($currentAudit['pending_payment_id'] ?? null) === ($candidate['payment_id'] ?? null)
                                && ($currentAudit['pending_cents'] ?? null) === $candidate['candidate_cents']);
                    $previousPaymentWasRecorded = $previousReportedPaid !== null && $previousPendingAmount !== null
                        && is_int($currentAudit['paid_cents'] ?? null)
                        && $currentAudit['paid_cents'] >= $previousReportedPaid + $previousPendingAmount;
                    $previousCycleSettled = $lastAttempt?->status === 'approved'
                        && isset($verifiedSettlements[$lastAttempt->id])
                        && ($cyclePreparation['auditsDisagree'] ?? true) === false
                        && ($currentAudit['status'] ?? null) === 'consistent_candidate'
                        && $currentAuditMatchesCandidate
                        && $previousPaymentWasRecorded
                        && (($snapshot['payment_id'] ?? null) === null
                            || ($previousSnapshot['payment_id'] ?? null) !== $snapshot['payment_id']);

                    // A new request key can create a new order only after an independently
                    // verified terminal gateway result has closed its reservation cycle.
                    $closedCycle = ($retryable || ($orderExpired && $lastAttempt !== null
                        && in_array($lastAttempt->status, ['rejected', 'cancelled', 'expired'], true))) && $lastAttempt !== null
                        && $lastAttempt->gateway_status === $lastAttempt->status
                        && is_string($lastAttempt->gateway_payment_id) && $lastAttempt->gateway_payment_id !== ''
                        && $lastAttempt->paid_at === null
                        && $lastAttempt->gateway_provider === $existingOrder->gateway_provider
                        && is_string($existingOrder->gateway_merchant_id) && $existingOrder->gateway_merchant_id !== ''
                        && $lastAttempt->gateway_merchant_id === $existingOrder->gateway_merchant_id
                        && DB::table('existing_reservation_payment_cycles')
                            ->where('direct_booking_order_id', $existingOrder->id)
                            ->where('direct_booking_payment_attempt_id', $lastAttempt->id)
                            ->where('state', 'declined')->whereNull('active_reservation_id')->exists();
                    $expiredWithoutCycle = $orderExpired && $lastAttempt === null
                        && ! DB::table('existing_reservation_payment_cycles')
                            ->where('direct_booking_order_id', $existingOrder->id)->exists();

                    if (! $sameBalance && ! $closedCycle && ! $expiredWithoutCycle && ! $previousCycleSettled) {
                        return ['order' => null, 'code' => 'existing_checkout_already_started', 'status' => 409];
                    }

                    if (! $expiredWithoutCycle && ! $previousCycleSettled && ! $closedCycle) {
                        // A different key cannot safely reuse an order unless the key is
                        // recorded. Reject it and preserve the original key for retries.
                        return ['order' => null, 'code' => 'existing_checkout_already_started', 'status' => 409];
                    }
                }
                $order = DirectBookingOrder::query()->create([
                    'status' => DirectBookingOrderStatus::PreReservado,
                    'idempotency_key' => $input['idempotencyKey'], 'request_fingerprint' => $fingerprint,
                    'existing_checkout_recovery_hash' => isset($input['recoverySecret']) ? hash_hmac('sha256', $input['recoverySecret'], (string) config('app.key')) : null,
                    'public_reference' => Str::random(40), 'resume_token' => Str::random(64), 'resume_token_expires_at' => now()->addDays($ttl),
                    'listing_id' => $snapshot['_idlisting'], 'stays_listing_id' => $snapshot['_idlisting'], 'stays_client_id' => $snapshot['_idclient'],
                    'stays_reservation_id' => $snapshot['_id'], 'reservation_status' => $reservation['type'],
                    'check_in' => $snapshot['checkInDate'], 'check_out' => $snapshot['checkOutDate'], 'guests' => $guests,
                    'guest_name' => trim($input['guest']['fullName']), 'guest_email' => mb_strtolower(trim($input['guest']['email'])), 'guest_phone' => $normalizedPhone,
                    'guest_cpf' => $input['guest']['cpf'] ?? null,
                    'quote_total' => sprintf('%d.%02d', intdiv($snapshot['pending_amount_cents'], 100), $snapshot['pending_amount_cents'] % 100), 'currency' => 'BRL',
                    'quote_snapshot' => [
                        'existing_reservation' => $snapshot,
                        'apartment_max_guests' => $snapshot['apartment_max_guests'],
                    ], 'accepted_terms_version' => 'existing-booking-payment-v1',
                    'accepted_terms_snapshot' => [
                        'version' => 'existing-booking-payment-v1',
                        'payment_plan' => $plan === 'deposit' ? 'deposit' : 'full',
                        'payment' => $plan === 'deposit'
                            ? 'Entrada de 50% do saldo em aberto da reserva existente.'
                            : 'Quitação integral do saldo em aberto da reserva existente.',
                        ...($contract !== null ? ['contract' => $contract, 'contract_content_hash' => $input['acceptedContract']['contentHash']] : []),
                    ],
                    'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'expires_at' => now()->addHours(3),
                    'gateway_provider' => (string) config('direct-booking.payment_provider'), 'gateway_merchant_id' => $merchantId,
                    'operational_events' => [['event' => 'existing_reservation_checkout_created', 'at' => now()->toISOString()]],
                ]);

                return ['order' => $order, 'code' => 'existing_checkout_ready', 'status' => 201];
            });
        } catch (UniqueConstraintViolationException) {
            return $this->result(null, 'existing_checkout_already_started', 409);
        }

        return $created['order'] instanceof DirectBookingOrder
            ? $this->result($created['order'], 'existing_checkout_ready', $created['status'])
            : $created;
    }

    /** @param array<string, mixed> $input
     * @return array{order: DirectBookingOrder|null, code: string, status: int}
     */
    private function completeUnrecordedReceivable(DirectBookingOrder $order, array $input, int $successStatus): array
    {
        $order->refresh();
        $quote = is_array($order->quote_snapshot) ? $order->quote_snapshot : [];
        $snapshot = $quote['existing_reservation'] ?? null;
        if (! is_array($snapshot) || ($snapshot['bootstrap_receivable'] ?? false) !== true) {
            return $this->result($order, 'existing_checkout_ready', $successStatus);
        }
        if (($snapshot['receivable_creation_timing'] ?? null) === 'after_capture') {
            return $this->result($order, 'existing_checkout_ready', $successStatus);
        }
        if (! $this->ledgerAllows($snapshot)) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        if (is_string($snapshot['payment_id'] ?? null) && is_string($snapshot['pending_provider_id'] ?? null)) {
            $action = $order->staysActions()->where('action_type', 'experimental_create_receivable')->where('status', 'succeeded')->first();
            if (! $action || $action->external_id !== $snapshot['payment_id']
                || ($action->request_snapshot['provider_id'] ?? null) !== $snapshot['pending_provider_id']
                || ($action->request_snapshot['method'] ?? null) !== $input['paymentMethod']
                || ($action->request_snapshot['installments'] ?? null) !== ($input['paymentMethod'] === 'card' ? (int) $input['installments'] : null)) {
                return $this->result(null, 'existing_receivable_unconfirmed', 503);
            }

            return $this->result($order, 'existing_checkout_ready', $successStatus);
        }
        $method = $input['paymentMethod'];
        $installments = $method === 'card' ? (int) $input['installments'] : null;
        if (! in_array($method, $this->channels->availableMethods($this->payments->availableMethods()), true)) {
            return $this->result(null, 'existing_payment_channel_unavailable', 503);
        }
        $result = app(ExperimentalExistingReceivableCreation::class)->create($order, $method, $installments);
        $paymentId = $result['payment_id'] ?? null;
        if (! ($result['ready'] ?? false) || ! is_string($paymentId)) {
            return $this->result(null, 'existing_receivable_unconfirmed', 503);
        }
        $updated = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $snapshot, $paymentId, $method, $installments): ?DirectBookingOrder {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $quote = is_array($locked->quote_snapshot) ? $locked->quote_snapshot : [];
            $current = $quote['existing_reservation'] ?? null;
            $action = $locked->staysActions()->where('action_type', 'experimental_create_receivable')->where('status', 'succeeded')->first();
            if ($locked->status !== DirectBookingOrderStatus::PreReservado || ! in_array($locked->payment_status, [null, 'not_started'], true)
                || ! $locked->expires_at?->isFuture() || ! is_array($current) || $current !== $snapshot
                || ! $action || $action->external_id !== $paymentId
                || ($action->request_snapshot['method'] ?? null) !== $method
                || ($action->request_snapshot['installments'] ?? null) !== $installments
                || ($action->request_snapshot['amount_cents'] ?? null) !== $current['pending_amount_cents']
                || ! is_string($action->request_snapshot['provider_id'] ?? null)
                || $locked->paymentAttempts()->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])->exists()) {
                return null;
            }
            $current['payment_id'] = $paymentId;
            $current['pending_provider_id'] = $action->request_snapshot['provider_id'];
            $quote['existing_reservation'] = $current;
            $locked->forceFill(['quote_snapshot' => $quote])->save();

            return $locked;
        });

        return $updated instanceof DirectBookingOrder
            ? $this->result($updated, 'existing_checkout_ready', $successStatus)
            : $this->result(null, 'existing_receivable_unconfirmed', 503);
    }

    private function canCreateCheckout(): bool
    {
        return ! (config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true
                && config('direct-booking.experimental_existing_ledger_audit_enabled', false) !== true)
            && config('direct-booking.enabled', false)
            && config('direct-booking.existing_reservation_checkout_enabled', false)
            && CieloDirectConfiguration::isProvider((string) config('direct-booking.payment_provider'))
            && $this->channels->availableMethods($this->payments->availableMethods()) !== []
            && $this->cielo->merchantId() !== null;
    }

    private function result(?DirectBookingOrder $order, string $code, int $status): array
    {
        return ['order' => $order, 'code' => $code, 'status' => $status];
    }

    /** @param array<string, mixed> $snapshot */
    private function ledgerAllows(array $snapshot): bool
    {
        if (config('direct-booking.experimental_existing_ledger_audit_enabled', false) !== true) {
            return true;
        }

        return app(ExistingReservationLedgerAudit::class)->confirmsSnapshot($snapshot);
    }
}
