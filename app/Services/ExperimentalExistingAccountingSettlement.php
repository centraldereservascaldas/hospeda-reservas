<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use App\Services\Payments\CieloDirectConfiguration;

/**
 * Isolated research adapter; simulated tests do not establish Stays API behaviour.
 * No application route or production feature flag invokes this service.
 */
class ExperimentalExistingAccountingSettlement
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly ExistingReservationPaymentGuard $guard,
        private readonly ExistingReservationPaymentChannels $channels,
    ) {}

    /** @return array{ready: bool, code: string} */
    public function settle(DirectBookingOrder $order): array
    {
        if (config('direct-booking.experimental_existing_accounting_settlement_enabled', false) !== true) {
            return $this->result(false, 'experimental_disabled');
        }

        $order->refresh();
        $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
        $attempts = $order->paymentAttempts()->where('status', 'approved')->get();
        $attempt = $attempts->count() === 1 ? $attempts->first() : null;
        if ($order->origin !== 'stays_existing' || $order->payment_status !== 'approved'
            || ! in_array($order->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
            || ! is_array($snapshot) || ! is_string($order->stays_reservation_id) || ! preg_match('/^[a-f0-9]{24}$/iD', $order->stays_reservation_id)
            || ! $attempt || ! is_string($attempt->gateway_payment_id) || $attempt->gateway_payment_id === ''
            || ! CieloDirectConfiguration::isProvider($attempt->gateway_provider)
            || $attempt->gateway_provider !== $order->gateway_provider
            || ! is_string($order->gateway_merchant_id) || $order->gateway_merchant_id === ''
            || $attempt->gateway_merchant_id !== $order->gateway_merchant_id
            || ! in_array($attempt->payment_method, ['pix', 'card'], true)
            || ($attempt->payment_method === 'card' && (! is_int($attempt->installments) || $attempt->installments < 1 || $attempt->installments > 6))
            || ! $attempt->paid_at || $attempt->currency !== 'BRL' || $order->currency !== 'BRL') {
            return $this->result(false, 'experimental_payment_not_confirmable');
        }

        $amount = $snapshot['pending_amount_cents'] ?? null;
        $paymentId = $snapshot['payment_id'] ?? null;
        $oldProvider = $snapshot['pending_provider_id'] ?? null;
        if (! is_int($amount) || $amount <= 0 || ! is_string($paymentId) || ! preg_match('/^[a-f0-9]{24}$/iD', $paymentId)
            || ! is_string($oldProvider) || ! preg_match('/^[a-f0-9]{24}$/iD', $oldProvider)
            || MoneyAmount::toCents($order->quote_total) !== $amount
            || MoneyAmount::toCents($attempt->base_amount ?? $attempt->amount) !== $amount) {
            return $this->result(false, 'experimental_snapshot_invalid');
        }
        if (! $this->paidWithinDeadline($order, $attempt)) {
            return $this->result(false, 'experimental_payment_after_expiration');
        }
        // Accounting for the card surcharge has not been agreed or verified.
        if (MoneyAmount::toCents($attempt->amount) !== $amount) {
            return $this->result(false, 'experimental_fee_reconciliation_unverified');
        }
        $channelSnapshot = $snapshot['channel_provider_ids'] ?? null;
        $target = is_array($channelSnapshot) ? $this->channels->verifiedProvider($channelSnapshot, $attempt->payment_method, $attempt->installments) : null;
        if (! is_string($target) || ! preg_match('/^[a-f0-9]{24}$/iD', $target)) {
            return $this->result(false, 'experimental_payment_channel_unavailable');
        }
        $date = $attempt->paid_at->toDateString();
        $reservationPath = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
        $accountingPath = '/finance/accounting-transactions/'.rawurlencode($paymentId);
        $existingAction = $order->staysActions()->where('action_type', 'experimental_settle_accounting')->first();
        if ($existingAction !== null) {
            if ($existingAction->status !== 'succeeded' || $existingAction->external_id !== $paymentId
                || ($existingAction->request_snapshot['attempt_id'] ?? null) !== $attempt->id
                || ($existingAction->request_snapshot['target_provider'] ?? null) !== $target) {
                return $this->result(false, 'experimental_settlement_already_started');
            }

            return $this->verifyCompleted($reservationPath, $accountingPath, $snapshot, $target, $date)
                ? $this->result(true, 'experimental_settlement_verified')
                : $this->result(false, 'experimental_settlement_unconfirmed');
        }
        if (! $this->verifyPending($reservationPath, $accountingPath, $snapshot, $oldProvider)) {
            return $this->result(false, 'experimental_source_changed');
        }

        $claim = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $attempt, $paymentId, $target, $amount): ?DirectBookingStaysAction {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($locked->origin !== 'stays_existing' || $locked->payment_status !== 'approved'
                || $locked->stays_reservation_id !== $order->stays_reservation_id
                || ! in_array($locked->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
                || $locked->paymentAttempts()->where('status', 'approved')->count() !== 1
                || ! $locked->paymentAttempts()->whereKey($attempt->id)->where('status', 'approved')->exists()) {
                return null;
            }
            $lockedAttempt = $locked->paymentAttempts()->whereKey($attempt->id)->lockForUpdate()->first();
            if (! $lockedAttempt || ! $this->paidWithinDeadline($locked, $lockedAttempt)) {
                return null;
            }
            if ($locked->staysActions()->where('action_type', 'settle_existing_receivable')->exists()) {
                return null;
            }
            $action = DirectBookingStaysAction::query()->firstOrCreate(
                ['direct_booking_order_id' => $locked->id, 'action_type' => 'experimental_settle_accounting'],
                ['status' => 'pending', 'idempotency_key' => 'experimental-accounting:'.$locked->id,
                    'request_snapshot' => ['attempt_id' => $attempt->id, 'payment_id' => $paymentId, 'target_provider' => $target, 'amount_cents' => $amount]],
            );
            if ($action->status !== 'pending' || (int) $action->attempt_count !== 0) {
                return null;
            }
            $action->forceFill(['status' => 'processing', 'attempt_count' => 1, 'last_attempt_at' => now()])->save();

            return $action;
        });
        if ($claim === null) {
            return $this->result(false, 'experimental_settlement_already_started');
        }

        $order->refresh();
        $attempt->refresh();
        if ($order->payment_status !== 'approved' || $attempt->status !== 'approved' || ! $this->paidWithinDeadline($order, $attempt)
            || ! in_array($order->status, [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional], true)
            || $this->channels->verifiedProvider($channelSnapshot, $attempt->payment_method, $attempt->installments) !== $target
            || ! $this->verifyPending($reservationPath, $accountingPath, $snapshot, $oldProvider)) {
            return $this->attention($claim, 'experimental_source_changed');
        }

        $this->stays->request('PATCH', $accountingPath, payload: [
            'bankAccountId' => $target,
            'paid' => true,
            'payment' => ['paymentDate' => $date],
        ]);
        if (! $this->verifyCompleted($reservationPath, $accountingPath, $snapshot, $target, $date)) {
            return $this->attention($claim, 'experimental_settlement_unconfirmed');
        }
        $claim->forceFill(['status' => 'succeeded', 'external_id' => $paymentId, 'completed_at' => now(),
            'response_snapshot' => ['payment_id' => $paymentId, 'provider_id' => $target, 'payment_date' => $date]])->save();

        return $this->result(true, 'experimental_settlement_verified');
    }

    private function verifyPending(string $reservationPath, string $accountingPath, array $snapshot, string $provider): bool
    {
        $reservation = $this->stays->get($reservationPath);
        $payments = $this->stays->get($reservationPath.'/payments');
        $accounting = $this->stays->get($accountingPath);

        return is_array($reservation) && is_array($payments) && is_array($accounting)
            && $this->guard->matches($reservation, $payments, $snapshot, allowConfirmedTransition: true)
            && $this->matchesAccounting($accounting, $snapshot, $provider, false);
    }

    private function verifyCompleted(string $reservationPath, string $accountingPath, array $snapshot, string $provider, string $date): bool
    {
        $reservation = $this->stays->get($reservationPath);
        $payments = $this->stays->get($reservationPath.'/payments');
        $accounting = $this->stays->get($accountingPath);
        if (! is_array($reservation) || ! $this->guard->matchesReservation($reservation, $snapshot, allowConfirmedTransition: true)
            || ! is_array($payments) || ! array_is_list($payments) || ! is_array($accounting)
            || ! $this->matchesAccounting($accounting, $snapshot, $provider, true)
            || ($accounting['payment']['paymentDate'] ?? null) !== $date) {
            return false;
        }
        $matches = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === $snapshot['payment_id']));
        $payment = count($matches) === 1 ? $matches[0] : null;

        return is_array($payment) && ($payment['type'] ?? null) === 'credit' && ($payment['status'] ?? null) === 'completed'
            && ($payment['_idpaymentProvider'] ?? null) === $provider && ($payment['paymentDate'] ?? null) === $date
            && MoneyAmount::toCents($payment['_f_val'] ?? null) === $snapshot['pending_amount_cents'];
    }

    private function matchesAccounting(array $accounting, array $snapshot, string $provider, bool $paid): bool
    {
        return ($accounting['_id'] ?? null) === ($snapshot['payment_id'] ?? null)
            && ($accounting['reserveId'] ?? null) === ($snapshot['_id'] ?? null)
            && ($accounting['type'] ?? null) === 'credit' && ($accounting['paid'] ?? null) === $paid
            && ($accounting['bankAccountId'] ?? null) === $provider
            && MoneyAmount::toCents($accounting['_mcval']['BRL'] ?? null) === ($snapshot['pending_amount_cents'] ?? null);
    }

    private function attention(DirectBookingStaysAction $action, string $code): array
    {
        $action->forceFill(['status' => 'attention_required', 'error_code' => $code, 'attention_required_at' => now()])->save();

        return $this->result(false, $code);
    }

    private function paidWithinDeadline(DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt): bool
    {
        return $order->expires_at !== null && $attempt->expires_at !== null && $attempt->paid_at !== null
            && $attempt->paid_at->lessThan($order->expires_at)
            && $attempt->paid_at->lessThan($attempt->expires_at);
    }

    private function result(bool $ready, string $code): array
    {
        return ['ready' => $ready, 'code' => $code];
    }
}
