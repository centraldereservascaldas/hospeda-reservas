<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use App\Services\Payments\CieloDirectConfiguration;
use Illuminate\Support\Str;

/** Settlement of an existing, identified Stays receivable after a verified gateway capture. */
class ExistingReservationSettlement
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly ExistingReservationPaymentGuard $guard,
        private readonly ExistingReservationPaymentChannels $channels,
    ) {}

    /** @return array{ready: bool, code: string} */
    public function settle(DirectBookingOrder $order): array
    {
        $order->refresh();
        $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
        $attempts = $order->paymentAttempts()->where('status', 'approved')->get();
        $attempt = $attempts->count() === 1 ? $attempts->first() : null;
        if ($order->origin !== 'stays_existing' || $order->payment_status !== 'approved'
            || ! in_array($order->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
            || ! is_string($order->stays_reservation_id) || ! preg_match('/^[a-f0-9]{24}$/iD', $order->stays_reservation_id) || ! is_array($snapshot)
            || ! $attempt || ! is_string($attempt->gateway_payment_id) || $attempt->gateway_payment_id === ''
            || ! CieloDirectConfiguration::isProvider($attempt->gateway_provider)
            || $attempt->gateway_provider !== $order->gateway_provider
            || ! is_string($order->gateway_merchant_id) || $order->gateway_merchant_id === ''
            || $attempt->gateway_merchant_id !== $order->gateway_merchant_id
            || ! in_array($attempt->payment_method, ['pix', 'card'], true)
            || ($attempt->payment_method === 'card' && (! is_int($attempt->installments) || $attempt->installments < 1 || $attempt->installments > 6))
            || ! $attempt->paid_at || $attempt->currency !== 'BRL' || $order->currency !== 'BRL'
            || MoneyAmount::toCents($attempt->base_amount ?? $attempt->amount) !== ($snapshot['pending_amount_cents'] ?? null)
            || MoneyAmount::toCents($order->quote_total) !== ($snapshot['pending_amount_cents'] ?? null)) {
            return ['ready' => false, 'code' => 'existing_payment_not_confirmable'];
        }

        if ($attempt->payment_method === 'card'
            && ! app(ExistingReservationCardAmounts::class)->matches($attempt, $snapshot['pending_amount_cents'])) {
            return ['ready' => false, 'code' => 'existing_card_amount_mismatch'];
        }

        $channelSnapshot = $snapshot['channel_provider_ids'] ?? null;
        $provider = is_array($channelSnapshot)
            ? $this->channels->verifiedProvider($channelSnapshot, $attempt->payment_method, $attempt->installments)
            : null;
        if ($provider === null) {
            return ['ready' => false, 'code' => 'existing_payment_channel_unavailable'];
        }

        $endpoint = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
        $paymentDate = $attempt->paid_at->setTimezone('America/Sao_Paulo')->toDateString();
        $attemptHash = $this->attemptHash($attempt);
        $previous = $order->staysActions()->where('action_type', 'settle_existing_receivable')->first();
        if ($previous !== null) {
            return $this->reconcilePrevious($order, $attempt->id, $attemptHash, $snapshot, $previous, $endpoint, $provider, $paymentDate);
        }
        if (config('direct-booking.experimental_existing_ledger_audit_enabled', false) === true
            && ! app(ExistingReservationLedgerAudit::class)->confirmsSnapshot($snapshot)) {
            return ['ready' => false, 'code' => 'existing_reservation_changed'];
        }
        $reservation = $this->stays->get($endpoint);
        $payments = $this->stays->get($endpoint.'/payments');
        if (! is_array($reservation) || ! is_array($payments) || ! $this->guard->matches($reservation, $payments, $snapshot, allowConfirmedTransition: true)) {
            return ['ready' => false, 'code' => 'existing_reservation_changed'];
        }
        $pending = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === ($snapshot['payment_id'] ?? null)));
        if (count($pending) !== 1 || ($pending[0]['_idpaymentProvider'] ?? null) !== $provider) {
            return ['ready' => false, 'code' => 'existing_payment_channel_mismatch'];
        }
        $originalDesc = $pending[0]['desc'] ?? '';
        if (! is_string($originalDesc) || strlen($originalDesc) > 900) {
            return ['ready' => false, 'code' => 'existing_settlement_description_unverified'];
        }
        $marker = 'CRCN_SETTLEMENT:'.Str::random(32);
        $originalHash = hash('sha256', $originalDesc);

        $claim = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $attempt, $attemptHash, $snapshot, $provider, $paymentDate, $marker, $originalHash): ?DirectBookingStaysAction {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($locked->origin !== 'stays_existing' || $locked->payment_status !== 'approved'
                || $locked->stays_reservation_id !== $order->stays_reservation_id
                || ! in_array($locked->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
                || $locked->paymentAttempts()->where('status', 'approved')->count() !== 1
                || ! $this->lockedAttemptMatches($locked, $attempt->id, $attemptHash)
                || $locked->gateway_provider !== $order->gateway_provider || $locked->gateway_merchant_id !== $order->gateway_merchant_id
                || $locked->currency !== 'BRL' || MoneyAmount::toCents($locked->quote_total) !== ($snapshot['pending_amount_cents'] ?? null)
                || ($locked->quote_snapshot['existing_reservation'] ?? null) !== $snapshot) {
                return null;
            }
            if ($locked->staysActions()->where('action_type', 'experimental_settle_accounting')->exists()) {
                return null;
            }
            $action = DirectBookingStaysAction::query()->firstOrCreate(
                ['direct_booking_order_id' => $locked->id, 'action_type' => 'settle_existing_receivable'],
                ['status' => 'pending', 'idempotency_key' => 'direct-booking:'.$locked->id.':settle-existing', 'request_snapshot' => ['attempt_id' => $attempt->id, 'attempt_hash' => $attemptHash, 'payment_id' => $snapshot['payment_id'], 'amount_cents' => $snapshot['pending_amount_cents'], 'payment_date' => $paymentDate, 'provider_id' => $provider, 'marker' => $marker, 'original_desc_hash' => $originalHash]],
            );
            if ($action->status !== 'pending' || (int) $action->attempt_count !== 0) {
                return null;
            }
            $action->forceFill(['status' => 'processing', 'attempt_count' => 1, 'last_attempt_at' => now()])->save();

            return $action;
        });
        if ($claim === null) {
            return ['ready' => false, 'code' => 'existing_settlement_already_started'];
        }

        $reservation = $this->stays->get($endpoint);
        $payments = $this->stays->get($endpoint.'/payments');
        $pending = is_array($payments) ? array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === ($snapshot['payment_id'] ?? null))) : [];
        if (! is_array($reservation) || ! is_array($payments) || ! $this->guard->matches($reservation, $payments, $snapshot, allowConfirmedTransition: true)
            || count($pending) !== 1 || ($pending[0]['_idpaymentProvider'] ?? null) !== $provider
            || ! is_string($pending[0]['desc'] ?? '') || ! hash_equals($originalHash, hash('sha256', $pending[0]['desc'] ?? ''))) {
            $this->markAttentionIfProcessing($claim, 'existing_reservation_changed');

            return ['ready' => false, 'code' => 'existing_reservation_changed'];
        }

        $order->refresh();
        $attempt->refresh();
        if ($order->payment_status !== 'approved' || $attempt->status !== 'approved' || ! hash_equals($attemptHash, $this->attemptHash($attempt))
            || $this->channels->verifiedProvider($channelSnapshot, $attempt->payment_method, $attempt->installments) !== $provider
            || (config('direct-booking.experimental_existing_ledger_audit_enabled', false) === true
                && ! app(ExistingReservationLedgerAudit::class)->confirmsSnapshot($snapshot))
            || ! in_array($order->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)) {
            $this->markAttentionIfProcessing($claim, 'existing_payment_state_changed');

            return ['ready' => false, 'code' => 'existing_payment_state_changed'];
        }

        $paymentId = $snapshot['payment_id'];
        $paymentName = $attempt->payment_method === 'pix' ? 'Pix API Cielo' : 'Cartão API Cielo '.$attempt->installments.'x';
        $sentClaim = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $attempt, $attemptHash, $snapshot, $claim): bool {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $action = DirectBookingStaysAction::query()->lockForUpdate()->findOrFail($claim->id);
            if ($locked->origin !== 'stays_existing' || $locked->payment_status !== 'approved'
                || $locked->stays_reservation_id !== $order->stays_reservation_id
                || ($locked->quote_snapshot['existing_reservation'] ?? null) !== $snapshot
                || ! in_array($locked->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
                || $locked->paymentAttempts()->where('status', 'approved')->count() !== 1
                || ! $this->lockedAttemptMatches($locked, $attempt->id, $attemptHash)
                || $locked->gateway_provider !== $order->gateway_provider || $locked->gateway_merchant_id !== $order->gateway_merchant_id
                || $locked->currency !== 'BRL' || MoneyAmount::toCents($locked->quote_total) !== ($snapshot['pending_amount_cents'] ?? null)
                || $action->status !== 'processing' || $action->attempt_count !== 1
                || ($action->request_snapshot['attempt_hash'] ?? null) !== $attemptHash) {
                return false;
            }
            $request = $action->request_snapshot;
            $request['write_started'] = true;
            $action->forceFill(['request_snapshot' => $request])->save();

            return true;
        });
        if (! $sentClaim) {
            $this->markAttentionIfProcessing($claim, 'existing_payment_state_changed');

            return ['ready' => false, 'code' => 'existing_payment_state_changed'];
        }
        $description = $originalDesc === '' ? $marker : $originalDesc."\n".$marker;
        $this->stays->request('PATCH', $endpoint.'/payments/'.rawurlencode($paymentId), payload: ['paymentDate' => $paymentDate, 'name' => $paymentName, 'desc' => $description]);
        $claim->refresh();
        $result = $this->reconcilePrevious($order, $attempt->id, $attemptHash, $snapshot, $claim, $endpoint, $provider, $paymentDate);
        if (! $result['ready']) {
            $this->markAttentionIfProcessing($claim, 'existing_settlement_unconfirmed');
        }

        return $result;
    }

    /** @param array<string, mixed> $snapshot
     * @return array{ready: bool, code: string}
     */
    private function reconcilePrevious(DirectBookingOrder $order, string $attemptId, string $attemptHash, array $snapshot, DirectBookingStaysAction $action, string $endpoint, string $provider, string $paymentDate): array
    {
        $request = is_array($action->request_snapshot) ? $action->request_snapshot : [];
        if (! in_array($action->status, ['succeeded', 'processing', 'attention_required'], true)
            || ($request['payment_id'] ?? null) !== ($snapshot['payment_id'] ?? null)
            || ($request['amount_cents'] ?? null) !== ($snapshot['pending_amount_cents'] ?? null)
            || ($request['payment_date'] ?? null) !== $paymentDate || ($request['provider_id'] ?? null) !== $provider
            || ($request['attempt_id'] ?? null) !== $attemptId || ($request['attempt_hash'] ?? null) !== $attemptHash) {
            return ['ready' => false, 'code' => 'existing_settlement_unconfirmed'];
        }
        $marker = $request['marker'] ?? null;
        $hash = $request['original_desc_hash'] ?? null;
        $hasMarker = is_string($marker) && preg_match('/^CRCN_SETTLEMENT:[A-Za-z0-9]{32}$/D', $marker)
            && is_string($hash) && preg_match('/^[a-f0-9]{64}$/D', $hash);
        if (! $hasMarker || ($request['write_started'] ?? null) !== true || $action->attempt_count !== 1) {
            return ['ready' => false, 'code' => 'existing_settlement_unconfirmed'];
        }
        if ($action->status === 'succeeded' && $action->external_id !== ($snapshot['payment_id'] ?? null)) {
            return ['ready' => false, 'code' => 'existing_settlement_unconfirmed'];
        }
        $reservation = $this->stays->get($endpoint);
        $after = $this->stays->get($endpoint.'/payments');
        $matching = is_array($after) && array_is_list($after)
            ? array_values(array_filter($after, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === ($snapshot['payment_id'] ?? null)))
            : [];
        $payment = count($matching) === 1 ? $matching[0] : null;
        $verified = is_array($reservation) && $this->guard->matchesReservation($reservation, $snapshot, allowConfirmedTransition: true)
            && is_array($payment) && ($payment['type'] ?? null) === 'credit' && ($payment['status'] ?? null) === 'completed'
            && ($payment['paymentDate'] ?? null) === $paymentDate && ($payment['_idpaymentProvider'] ?? null) === $provider
            && MoneyAmount::toCents($payment['_f_val'] ?? null) === ($snapshot['pending_amount_cents'] ?? null)
            && $this->matchesMarker($payment, $marker, $hash)
            && $this->financeConfirmsSettlement($snapshot, $provider, $paymentDate);
        if (! $verified) {
            return ['ready' => false, 'code' => 'existing_settlement_unconfirmed'];
        }
        $promoted = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $attemptId, $attemptHash, $snapshot, $action, $request): bool {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $current = DirectBookingStaysAction::query()->lockForUpdate()->findOrFail($action->id);
            if ($locked->origin !== 'stays_existing' || $locked->payment_status !== 'approved'
                || $locked->stays_reservation_id !== $order->stays_reservation_id
                || ($locked->quote_snapshot['existing_reservation'] ?? null) !== $snapshot
                || ! in_array($locked->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
                || $locked->paymentAttempts()->where('status', 'approved')->count() !== 1
                || ! $this->lockedAttemptMatches($locked, $attemptId, $attemptHash)
                || $locked->gateway_provider !== $order->gateway_provider || $locked->gateway_merchant_id !== $order->gateway_merchant_id
                || $locked->currency !== 'BRL' || MoneyAmount::toCents($locked->quote_total) !== ($snapshot['pending_amount_cents'] ?? null)
                || $current->direct_booking_order_id !== $locked->id || $current->request_snapshot !== $request
                || ! in_array($current->status, ['processing', 'attention_required', 'succeeded'], true)) {
                return false;
            }
            if ($current->status !== 'succeeded') {
                $current->forceFill(['status' => 'succeeded', 'external_id' => $snapshot['payment_id'], 'completed_at' => now(), 'error_code' => null,
                    'response_snapshot' => ['payment_id' => $snapshot['payment_id'], 'status' => 'completed', 'payment_date' => $request['payment_date']]])->save();
            }

            return $current->external_id === $snapshot['payment_id'];
        });

        if ($promoted && config('direct-booking.experimental_existing_cycle_settlement_enabled', false) === true) {
            // Optional cycle closure never changes the verified settlement result.
            // Failure leaves the cycle open for operational reconciliation.
            app(ExperimentalExistingCycleSettlement::class)->close($order);
        }

        return ['ready' => $promoted, 'code' => $promoted ? 'existing_settlement_verified' : 'existing_settlement_unconfirmed'];
    }

    /** @param array<string, mixed> $payment */
    private function matchesMarker(array $payment, string $marker, string $originalHash): bool
    {
        $description = $payment['desc'] ?? null;
        if (! is_string($description) || ! str_ends_with($description, $marker)) {
            return false;
        }
        $prefix = substr($description, 0, -strlen($marker));
        if ($prefix !== '' && ! str_ends_with($prefix, "\n")) {
            return false;
        }
        $original = $prefix === '' ? '' : substr($prefix, 0, -1);

        return hash_equals($originalHash, hash('sha256', $original));
    }

    private function markAttentionIfProcessing(DirectBookingStaysAction $action, string $code): void
    {
        // A concurrent read-only reconciliation may already have succeeded.
        DirectBookingStaysAction::query()->whereKey($action->id)->where('status', 'processing')
            ->update(['status' => 'attention_required', 'error_code' => $code, 'attention_required_at' => now()]);
    }

    private function lockedAttemptMatches(DirectBookingOrder $order, string $attemptId, string $expectedHash): bool
    {
        $attempt = $order->paymentAttempts()->whereKey($attemptId)->lockForUpdate()->first();

        return $attempt instanceof DirectBookingPaymentAttempt && $attempt->status === 'approved'
            && hash_equals($expectedHash, $this->attemptHash($attempt));
    }

    private function attemptHash(DirectBookingPaymentAttempt $attempt): string
    {
        return hash('sha256', json_encode([
            $attempt->id, $attempt->status, $attempt->gateway_payment_id, $attempt->gateway_provider, $attempt->gateway_merchant_id,
            $attempt->payment_method, $attempt->payment_method_id, $attempt->installments, $attempt->currency,
            $attempt->amount, $attempt->base_amount, $attempt->processing_fee_amount, $attempt->processing_fee_basis_points,
            $attempt->paid_at?->utc()->format('Y-m-d\TH:i:s.uP'), $attempt->expires_at?->utc()->format('Y-m-d\TH:i:s.uP'),
        ], JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed> $snapshot */
    private function financeConfirmsSettlement(array $snapshot, string $provider, string $paymentDate): bool
    {
        $id = $snapshot['payment_id'] ?? null;
        if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id)) {
            return false;
        }
        $financial = $this->stays->get('/finance/accounting-transactions/'.rawurlencode($id));

        return is_array($financial) && ($financial['_id'] ?? null) === $id
            && ($financial['reserveId'] ?? null) === ($snapshot['_id'] ?? null)
            && ($financial['type'] ?? null) === 'credit' && ($financial['paid'] ?? null) === true
            && ($financial['bankAccountId'] ?? null) === $provider
            && ($financial['payment']['paymentDate'] ?? null) === $paymentDate
            && MoneyAmount::toCents($financial['_mcval']['BRL'] ?? null) === ($snapshot['pending_amount_cents'] ?? null);
    }
}
