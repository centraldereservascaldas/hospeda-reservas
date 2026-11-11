<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use DateTimeImmutable;

/** Creates and verifies an outstanding Stays receivable before exposing checkout. */
class ExperimentalExistingReceivableCreation
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly ExistingReservationBalance $balance,
        private readonly ExistingReservationPaymentGuard $guard,
        private readonly ExistingReservationPaymentChannels $channels,
    ) {}

    /** @return array{ready: bool, code: string, payment_id: string|null} */
    public function create(DirectBookingOrder $order, string $method, ?int $installments = null): array
    {
        $order->refresh();
        $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
        if ($order->origin !== 'stays_existing' || $order->status !== DirectBookingOrderStatus::PreReservado
            || ! in_array($order->payment_status, [null, 'not_started'], true) || ! is_array($snapshot)
            || ($snapshot['bootstrap_receivable'] ?? null) !== true
            || ! is_string($order->stays_reservation_id) || ! preg_match('/^[a-f0-9]{24}$/iD', $order->stays_reservation_id)
            || ($snapshot['_id'] ?? null) !== $order->stays_reservation_id
            || ($snapshot['payment_id'] ?? null) !== null || $order->currency !== 'BRL'
            || ! is_int($snapshot['pending_amount_cents'] ?? null) || $snapshot['pending_amount_cents'] <= 0
            || MoneyAmount::toCents($order->quote_total) !== $snapshot['pending_amount_cents']
            || ! is_string($snapshot['checkInDate'] ?? null)
            || ! $this->validDate($snapshot['checkInDate'])
            || $snapshot['checkInDate'] < now()->toDateString()
            || ! $order->expires_at?->isFuture()
            || ! in_array($method, ['pix', 'card'], true)
            || ($method === 'pix' && $installments !== null)
            || ($method === 'card' && (! is_int($installments) || $installments < 1 || $installments > 6))
            || ($snapshot['selected_payment_method'] ?? null) !== $method
            || ! array_key_exists('selected_installments', $snapshot) || $snapshot['selected_installments'] !== $installments) {
            return $this->result(false, 'experimental_receivable_order_invalid');
        }
        $channelSnapshot = $snapshot['channel_provider_ids'] ?? null;
        $provider = is_array($channelSnapshot) ? $this->channels->verifiedProvider($channelSnapshot, $method, $installments) : null;
        if (! is_string($provider) || ! preg_match('/^[a-f0-9]{24}$/iD', $provider)) {
            return $this->result(false, 'experimental_receivable_channel_unavailable');
        }
        $path = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
        $marker = 'CRCN_EXISTING_ORDER:'.$order->id.':PENDING';
        $existing = $order->staysActions()->where('action_type', 'experimental_create_receivable')->first();
        if ($existing !== null) {
            if ($existing->status !== 'succeeded' || ! is_string($existing->external_id)
                || ($existing->request_snapshot['provider_id'] ?? null) !== $provider
                || ($existing->request_snapshot['method'] ?? null) !== $method
                || ($existing->request_snapshot['installments'] ?? null) !== $installments) {
                return $this->result(false, 'experimental_receivable_already_started');
            }
            $paymentId = $this->verifyCreated($path, $snapshot, $provider, $marker);

            return is_string($paymentId) && hash_equals($existing->external_id, $paymentId)
                ? $this->result(true, 'experimental_receivable_verified', $paymentId)
                : $this->result(false, 'experimental_receivable_unconfirmed');
        }
        if (! $this->verifySource($path, $snapshot)) {
            return $this->result(false, 'experimental_receivable_source_changed');
        }

        $claim = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $provider, $method, $installments, $snapshot): ?DirectBookingStaysAction {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if (! $this->matchesOrderSnapshot($locked, $snapshot, $method, $installments)
                || app(ReservationReleaseGuard::class)->paymentBlocked(strtolower($locked->stays_reservation_id))
                || $locked->status !== DirectBookingOrderStatus::PreReservado || $locked->origin !== 'stays_existing'
                || ! in_array($locked->payment_status, [null, 'not_started'], true)
                || ! $locked->expires_at?->isFuture()
                || $this->hasUnresolvedAttempt($locked->stays_reservation_id)) {
                return null;
            }
            if (DirectBookingStaysAction::query()->whereHas('order', fn ($query) => $query->where('stays_reservation_id', $locked->stays_reservation_id))
                ->where('action_type', 'experimental_create_receivable')->exists()) {
                return null;
            }
            $action = DirectBookingStaysAction::query()->firstOrCreate(
                ['direct_booking_order_id' => $locked->id, 'action_type' => 'experimental_create_receivable'],
                ['status' => 'pending', 'idempotency_key' => 'experimental-receivable:'.$locked->id,
                    'request_snapshot' => ['provider_id' => $provider, 'method' => $method, 'installments' => $installments, 'amount_cents' => $snapshot['pending_amount_cents']]],
            );
            if ($action->status !== 'pending' || (int) $action->attempt_count !== 0) {
                return null;
            }
            $action->forceFill(['status' => 'processing', 'attempt_count' => 1, 'last_attempt_at' => now()])->save();

            return $action;
        });
        if ($claim === null) {
            return $this->result(false, 'experimental_receivable_already_started');
        }
        $order->refresh();
        if (! $this->matchesOrderSnapshot($order, $snapshot, $method, $installments)
            || $order->status !== DirectBookingOrderStatus::PreReservado || ! in_array($order->payment_status, [null, 'not_started'], true)
            || ! $order->expires_at?->isFuture()
            || $order->paymentAttempts()->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])->exists()
            || $this->channels->verifiedProvider($channelSnapshot, $method, $installments) !== $provider
            || ! $this->verifySource($path, $snapshot)) {
            return $this->attention($claim, 'experimental_receivable_source_changed');
        }

        $maySend = app(ExistingReservationPaymentLock::class)->synchronized($order->stays_reservation_id, function () use ($order, $snapshot, $method, $installments, $provider, $claim): bool {
            $locked = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $action = DirectBookingStaysAction::query()->lockForUpdate()->findOrFail($claim->id);

            return $this->matchesOrderSnapshot($locked, $snapshot, $method, $installments)
                && ! app(ReservationReleaseGuard::class)->paymentBlocked(strtolower($locked->stays_reservation_id))
                && $locked->origin === 'stays_existing' && $locked->status === DirectBookingOrderStatus::PreReservado
                && in_array($locked->payment_status, [null, 'not_started'], true) && $locked->expires_at?->isFuture() === true
                && ! $this->hasUnresolvedAttempt($locked->stays_reservation_id)
                && $action->direct_booking_order_id === $locked->id && $action->status === 'processing'
                && ($action->request_snapshot['provider_id'] ?? null) === $provider
                && ($action->request_snapshot['method'] ?? null) === $method
                && ($action->request_snapshot['installments'] ?? null) === $installments;
        });
        if (! $maySend) {
            return $this->attention($claim, 'experimental_receivable_source_changed');
        }

        $this->stays->request('POST', $path.'/payments', payload: [
            '_idpaymentProvider' => $provider, 'type' => 'credit', '_f_val' => $snapshot['pending_amount_cents'] / 100,
            'status' => 'pending', 'expirationDate' => $snapshot['checkInDate'], 'name' => 'Pagamento da reserva', 'desc' => $marker,
        ]);
        $paymentId = $this->verifyCreated($path, $snapshot, $provider, $marker);
        if ($paymentId === null) {
            return $this->attention($claim, 'experimental_receivable_unconfirmed');
        }
        $claim->forceFill(['status' => 'succeeded', 'external_id' => $paymentId, 'completed_at' => now(),
            'response_snapshot' => ['payment_id' => $paymentId, 'provider_id' => $provider]])->save();

        return $this->result(true, 'experimental_receivable_verified', $paymentId);
    }

    private function verifySource(string $path, array $snapshot): bool
    {
        $reservation = $this->stays->get($path);
        $payments = $this->stays->get($path.'/payments');
        $candidate = is_array($reservation) && is_array($payments) ? $this->balance->inspect($reservation, $payments) : null;
        if (! is_array($reservation) || ! is_array($payments) || ! $this->guard->matchesReservation($reservation, $snapshot)
            || ! $this->guard->matchesReportedPaid($reservation, $snapshot)
            || ($candidate['status'] ?? null) !== 'unrecorded_candidate'
            || ($candidate['candidate_cents'] ?? null) !== $snapshot['pending_amount_cents']) {
            return false;
        }

        return true;
    }

    private function verifyCreated(string $path, array $snapshot, string $provider, string $marker): ?string
    {
        $reservation = $this->stays->get($path);
        $payments = $this->stays->get($path.'/payments');
        if (! is_array($reservation) || ! $this->guard->matchesReservation($reservation, $snapshot)
            || ! $this->guard->matchesReportedPaid($reservation, $snapshot)
            || ! is_array($payments) || ! array_is_list($payments)) {
            return null;
        }
        $credits = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment)
            && ($payment['type'] ?? null) === 'credit' && ($payment['status'] ?? null) === 'pending'
            && ($payment['desc'] ?? null) === $marker));
        if (count($credits) !== 1) {
            return null;
        }
        $payment = $credits[0];
        $id = $payment['_id'] ?? null;
        if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id)
            || ($payment['status'] ?? null) !== 'pending' || ($payment['_idpaymentProvider'] ?? null) !== $provider
            || ($payment['name'] ?? null) !== 'Pagamento da reserva' || ($payment['desc'] ?? null) !== $marker
            || ($payment['expirationDate'] ?? null) !== $snapshot['checkInDate'] || ! empty($payment['paymentDate'])
            || ($payment['readonly'] ?? false) !== false
            || MoneyAmount::toCents($payment['_f_val'] ?? null) !== $snapshot['pending_amount_cents']) {
            return null;
        }
        $pendingSnapshot = $snapshot;
        $pendingSnapshot['payment_id'] = $id;
        $pendingSnapshot['pending_provider_id'] = $provider;
        if (! $this->guard->matches($reservation, $payments, $pendingSnapshot)) {
            return null;
        }
        $accounting = $this->stays->get('/finance/accounting-transactions/'.rawurlencode($id));
        if (! is_array($accounting) || ($accounting['_id'] ?? null) !== $id
            || ($accounting['reserveId'] ?? null) !== $snapshot['_id'] || ($accounting['type'] ?? null) !== 'credit'
            || ($accounting['paid'] ?? null) !== false || ($accounting['bankAccountId'] ?? null) !== $provider
            || MoneyAmount::toCents($accounting['_mcval']['BRL'] ?? null) !== $snapshot['pending_amount_cents']) {
            return null;
        }

        return $id;
    }

    private function attention(DirectBookingStaysAction $action, string $code): array
    {
        $action->forceFill(['status' => 'attention_required', 'error_code' => $code, 'attention_required_at' => now()])->save();

        return $this->result(false, $code);
    }

    private function matchesOrderSnapshot(DirectBookingOrder $order, array $snapshot, string $method, ?int $installments): bool
    {
        return $order->stays_reservation_id === ($snapshot['_id'] ?? null)
            && is_array($order->quote_snapshot) && ($order->quote_snapshot['existing_reservation'] ?? null) === $snapshot
            && $order->currency === 'BRL' && MoneyAmount::toCents($order->quote_total) === ($snapshot['pending_amount_cents'] ?? null)
            && ($snapshot['selected_payment_method'] ?? null) === $method
            && array_key_exists('selected_installments', $snapshot) && $snapshot['selected_installments'] === $installments;
    }

    private function hasUnresolvedAttempt(string $reservationId): bool
    {
        return DirectBookingPaymentAttempt::query()
            ->where(fn ($query) => $query->where('stays_reservation_canonical_id', strtolower($reservationId))
                ->orWhereHas('order', fn ($query) => $query->whereIn('stays_reservation_id', [strtolower($reservationId), strtoupper($reservationId)])))
            ->whereIn('status', ['processing', 'pending', 'in_process', 'approved', 'unknown', 'attention_required'])
            ->exists();
    }

    private function validDate(string $value): bool
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value;
    }

    private function result(bool $ready, string $code, ?string $paymentId = null): array
    {
        return ['ready' => $ready, 'code' => $code, 'payment_id' => $paymentId];
    }
}
