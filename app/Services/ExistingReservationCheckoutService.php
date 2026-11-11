<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\CieloEcommerceClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ExistingReservationCheckoutService
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly ExistingReservationBalance $balance,
        private readonly ExistingReservationPaymentChannels $channels,
        private readonly DirectCheckoutPaymentService $payments,
        private readonly CieloEcommerceClient $cielo,
    ) {}

    /** @param array<string, mixed> $input
     * @return array{order: DirectBookingOrder|null, code: string, status: int}
     */
    public function create(string $code, array $input, bool $intentVerified = false): array
    {
        if (($input['paymentMethod'] ?? null) === 'card') {
            return $this->result(null, 'existing_card_fee_accounting_unverified', 503);
        }
        if (! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return $this->result(null, 'reservation_not_found', 404);
        }
        $fingerprint = hash_hmac('sha256', json_encode([
            $code,
            $input['expectedBalanceCents'],
            $input['guest'],
            $input['paymentMethod'],
            $input['paymentMethod'] === 'card' ? (int) $input['installments'] : null,
            true,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
        $existing = DirectBookingOrder::query()->where('idempotency_key', $input['idempotencyKey'])->first();
        if ($existing !== null) {
            if ($existing->origin !== 'stays_existing' || ! hash_equals($existing->request_fingerprint, $fingerprint)
                || ! $existing->hasValidResumeToken($existing->resume_token ?? '')) {
                return $this->result(null, 'existing_checkout_unavailable', 409);
            }

            return $this->recoverExisting($existing, $input, $intentVerified);
        }

        if (config('direct-booking.experimental_existing_ledger_audit_enabled', false) !== true) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        if (! config('direct-booking.enabled', false) || ! config('direct-booking.existing_reservation_checkout_enabled', false)
            || ! CieloDirectConfiguration::isProvider((string) config('direct-booking.payment_provider'))
            || $this->channels->availableMethods($this->payments->availableMethods()) === [] || $this->cielo->merchantId() === null) {
            return $this->result(null, 'existing_checkout_disabled', 503);
        }

        $reservation = $this->stays->get('/booking/reservations/'.$code);
        $payments = $this->stays->get('/booking/reservations/'.$code.'/payments');
        if (! is_array($reservation) || ! is_array($payments)) {
            return $this->result(null, 'existing_reservation_unavailable', 503);
        }
        $candidate = $this->balance->inspect($reservation, $payments);
        if ($candidate['status'] === 'pending_candidate'
            && app(ExistingReservationBootstrapOrigin::class)->requiresReview($reservation['_id'] ?? null, $payments, $candidate['payment_id'])) {
            return $this->result(null, 'existing_balance_unverified', 409);
        }
        $approvalVersion = ExistingReservationBalanceApproval::version(ExistingReservationBalanceApproval::projection($reservation, $candidate['candidate_cents']));
        $bootstrap = $candidate['status'] === 'unrecorded_candidate'
            && config('direct-booking.experimental_existing_receivable_creation_enabled', false) === true
            && $approvalVersion !== null;
        if (($reservation['id'] ?? null) !== $code || (! $bootstrap && $candidate['status'] !== 'pending_candidate')
            || $candidate['candidate_cents'] !== $input['expectedBalanceCents']) {
            return $this->result(null, 'existing_balance_unverified', 409);
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
        $snapshot['pending_amount_cents'] = $candidate['candidate_cents'];
        $snapshot['currency'] = 'BRL';
        $snapshot['approval_version'] = $bootstrap ? $approvalVersion : null;
        $snapshot['payment_id'] = $candidate['payment_id'];
        $snapshot['bootstrap_receivable'] = $bootstrap;
        $snapshot['channel_provider_ids'] = $this->channels->snapshot();
        $method = $input['paymentMethod'];
        $installments = $method === 'card' ? (int) $input['installments'] : null;
        $snapshot['selected_payment_method'] = $method;
        $snapshot['selected_installments'] = $installments;
        $provider = $this->channels->verifiedProvider($snapshot['channel_provider_ids'], $method, $installments);
        $pending = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === $candidate['payment_id']));
        if (! in_array($method, $this->channels->availableMethods($this->payments->availableMethods()), true)
            || $provider === null || (! $bootstrap && (count($pending) !== 1 || ($pending[0]['_idpaymentProvider'] ?? null) !== $provider))) {
            return $this->result(null, 'existing_payment_channel_unavailable', 503);
        }
        $snapshot['pending_provider_id'] = $bootstrap ? null : $provider;
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
        try {
            $created = app(ExistingReservationPaymentLock::class)->synchronized($snapshot['_id'], function () use ($input, $fingerprint, $ttl, $snapshot, $reservation, $guests, $candidate, $merchantId, $intentVerified): array {
                if (app(ReservationReleaseGuard::class)->paymentBlocked(strtolower($snapshot['_id']), $reservation['id'])) {
                    return ['order' => null, 'code' => 'existing_checkout_unavailable', 'status' => 409];
                }
                $existing = DirectBookingOrder::query()->where('idempotency_key', $input['idempotencyKey'])->first();
                if ($existing !== null) {
                    if ($existing->origin !== 'stays_existing' || ! hash_equals($existing->request_fingerprint, $fingerprint)
                        || ! $existing->hasValidResumeToken($existing->resume_token ?? '')) {
                        return ['order' => null, 'code' => 'existing_checkout_unavailable', 'status' => 409];
                    }

                    return $this->recoverExisting($existing, $input, $intentVerified);
                }
                $aliases = [strtolower($snapshot['_id']), strtoupper($snapshot['_id']), $reservation['id']];
                if (DirectBookingOrder::query()->where('origin', '!=', 'stays_existing')->whereIn('stays_reservation_id', $aliases)->exists()
                    || app(ReservationReleaseGuard::class)->hasAmbiguousOrder($aliases)) {
                    return ['order' => null, 'code' => 'existing_checkout_already_started', 'status' => 409];
                }
                if (config('direct-booking.experimental_existing_order_history_enabled', false) !== true
                    && DirectBookingOrder::query()->whereIn('stays_reservation_id', $aliases)->exists()) {
                    return ['order' => null, 'code' => 'existing_checkout_already_started', 'status' => 409];
                }
                $order = DirectBookingOrder::query()->create([
                    'status' => DirectBookingOrderStatus::PreReservado,
                    'idempotency_key' => $input['idempotencyKey'], 'request_fingerprint' => $fingerprint,
                    'public_reference' => Str::random(40), 'resume_token' => Str::random(64), 'resume_token_expires_at' => now()->addDays($ttl),
                    'listing_id' => $snapshot['_idlisting'], 'stays_listing_id' => $snapshot['_idlisting'], 'stays_client_id' => $snapshot['_idclient'],
                    'stays_reservation_id' => $snapshot['_id'], 'reservation_status' => $reservation['type'],
                    'check_in' => $snapshot['checkInDate'], 'check_out' => $snapshot['checkOutDate'], 'guests' => $guests,
                    'guest_name' => trim($input['guest']['fullName']), 'guest_email' => mb_strtolower(trim($input['guest']['email'])), 'guest_phone' => trim($input['guest']['phone']),
                    'quote_total' => sprintf('%d.%02d', intdiv($candidate['candidate_cents'], 100), $candidate['candidate_cents'] % 100), 'currency' => 'BRL',
                    'quote_snapshot' => ['existing_reservation' => $snapshot], 'accepted_terms_version' => 'existing-booking-payment-v1',
                    'accepted_terms_snapshot' => ['version' => 'existing-booking-payment-v1', 'payment' => 'Pagamento do saldo exibido da reserva existente.'],
                    'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'expires_at' => now()->addHours(3),
                    'gateway_provider' => (string) config('direct-booking.payment_provider'), 'gateway_merchant_id' => $merchantId,
                    'operational_events' => [['event' => 'existing_reservation_checkout_created', 'at' => now()->toISOString()]],
                ]);

                return ['order' => $order, 'code' => 'existing_checkout_ready', 'status' => 201];
            });
        } catch (UniqueConstraintViolationException) {
            $existing = DirectBookingOrder::query()->where('idempotency_key', $input['idempotencyKey'])->first();
            if ($existing !== null && $existing->origin === 'stays_existing'
                && hash_equals($existing->request_fingerprint, $fingerprint)
                && $existing->hasValidResumeToken($existing->resume_token ?? '')) {
                return $this->recoverExisting($existing, $input, $intentVerified);
            }

            return $this->result(null, 'existing_checkout_already_started', 409);
        }

        return $created['order'] instanceof DirectBookingOrder && $created['status'] === 201
            ? $this->completeExperimentalBootstrap($created['order'], $input, $created['status'])
            : $created;
    }

    /** @param array<string, mixed> $input
     * @return array{order: DirectBookingOrder|null, code: string, status: int}
     */
    public function recoverByIntent(string $code, mixed $key): ?DirectBookingOrder
    {
        if (config('direct-booking.experimental_existing_intent_recovery_enabled', false) !== true
            || config('direct-booking.experimental_existing_intent_guard_enabled', false) !== true
            || ! preg_match('/^[A-Z0-9]{5}$/D', $code)
            || ! is_string($key) || ! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di', $key)) {
            return null;
        }
        $intent = DB::table('existing_checkout_intents')->where('key_hash', hash('sha256', $key))->first();
        $order = DirectBookingOrder::query()->where('idempotency_key', $key)->first();
        $snapshot = $order?->quote_snapshot['existing_reservation'] ?? null;
        if (! $intent || $intent->state !== 'claimed' || ! is_string($intent->payload_hmac)
            || ! $order || $order->origin !== 'stays_existing' || ! is_array($snapshot)
            || ($snapshot['reservation_code'] ?? null) !== $code || ! $order->hasValidResumeToken($order->resume_token ?? '')) {
            return null;
        }
        $input = ['idempotencyKey' => $key, 'paymentMethod' => $snapshot['selected_payment_method'] ?? null,
            'installments' => $snapshot['selected_installments'] ?? null];
        $result = $this->recoverExisting($order, $input, true);

        return $result['order'];
    }

    private function recoverExisting(DirectBookingOrder $order, array $input, bool $intentVerified): array
    {
        if (config('direct-booking.experimental_existing_intent_recovery_enabled', false) !== true) {
            return $this->result(null, 'existing_checkout_unavailable', 409);
        }
        if (! $intentVerified || config('direct-booking.experimental_existing_intent_guard_enabled', false) !== true
            || ! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di', $input['idempotencyKey'])) {
            return $this->result(null, 'existing_checkout_unavailable', 409);
        }
        $snapshot = $order->quote_snapshot['existing_reservation'] ?? null;
        if (! is_array($snapshot)) {
            return $this->result(null, 'existing_receivable_unconfirmed', 503);
        }
        if (($snapshot['bootstrap_receivable'] ?? false) === true) {
            $action = $order->staysActions()->where('action_type', 'experimental_create_receivable')->where('status', 'succeeded')->first();
            if (! is_string($snapshot['payment_id'] ?? null) || ! is_string($snapshot['pending_provider_id'] ?? null)
                || ! $action || $action->external_id !== $snapshot['payment_id']
                || ($action->request_snapshot['provider_id'] ?? null) !== $snapshot['pending_provider_id']
                || ($action->request_snapshot['method'] ?? null) !== $input['paymentMethod']
                || ($action->request_snapshot['installments'] ?? null) !== ($input['paymentMethod'] === 'card' ? (int) $input['installments'] : null)
                || ($action->request_snapshot['amount_cents'] ?? null) !== ($snapshot['pending_amount_cents'] ?? null)) {
                return $this->result(null, 'existing_receivable_unconfirmed', 503);
            }
        }

        return $this->result($order, 'existing_checkout_ready', 200);
    }

    private function completeExperimentalBootstrap(DirectBookingOrder $order, array $input, int $successStatus): array
    {
        $order->refresh();
        $quote = is_array($order->quote_snapshot) ? $order->quote_snapshot : [];
        $snapshot = $quote['existing_reservation'] ?? null;
        if (! is_array($snapshot) || ($snapshot['bootstrap_receivable'] ?? false) !== true) {
            return $this->result($order, 'existing_checkout_ready', $successStatus);
        }
        if (config('direct-booking.experimental_existing_receivable_creation_enabled', false) !== true) {
            return $this->result(null, 'existing_checkout_disabled', 503);
        }
        if (! ExistingReservationBalanceApproval::approved($snapshot)) {
            return $this->result(null, 'existing_balance_unverified', 409);
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
                || ! ExistingReservationBalanceApproval::approved($current)
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
