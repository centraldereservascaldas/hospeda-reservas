<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;

class ExistingReservationBootstrapRecovery
{
    public function __construct(private readonly StaysExternalApiClient $stays, private readonly ExistingReservationPaymentGuard $guard) {}

    /**
     * Read-only diagnostic. It never releases a cycle, updates Stays, reveals
     * a resume token or authorizes a payment. Only the original browser holding
     * its token can attempt a normal resume through the existing checkout flow.
     *
     * @return array{state: string, selected_method: string|null, original_session_may_resume: bool}
     */
    public function inspect(DirectBookingOrder $order): array
    {
        $order->refresh();
        $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
        if ($order->origin !== 'stays_existing' || ! is_array($snapshot) || ($snapshot['bootstrap_receivable'] ?? false) !== true) {
            return $this->report('not_bootstrap', null);
        }
        $method = in_array($snapshot['selected_payment_method'] ?? null, ['pix', 'card'], true) ? $snapshot['selected_payment_method'] : null;
        $attempts = $order->paymentAttempts()->get();
        if ($attempts->where('status', 'approved')->count() > 1) {
            return $this->report('multiple_payments_require_review', $method);
        }
        if ($order->payment_status === 'approved' || $attempts->contains('status', 'approved')) {
            return $this->report($order->status === DirectBookingOrderStatus::Confirmado ? 'payment_confirmed' : 'payment_confirmation_requires_review', $method);
        }
        if ($attempts->contains(fn ($attempt): bool => in_array($attempt->status, ['unknown', 'attention_required'], true))) {
            return $this->report('payment_reconciliation_required', $method);
        }
        if ($attempts->contains(fn ($attempt): bool => in_array($attempt->status, ['processing', 'pending', 'in_process'], true))) {
            return $this->report('payment_pending', $method);
        }
        $action = $order->staysActions()->where('action_type', 'experimental_create_receivable')->first();
        if ($action === null || $action->status !== 'succeeded' || ! is_string($action->external_id)) {
            return $this->report('receivable_reconciliation_required', $method);
        }
        if (! is_string($snapshot['payment_id'] ?? null) || $snapshot['payment_id'] !== $action->external_id
            || ! is_string($snapshot['pending_provider_id'] ?? null)
            || ($action->request_snapshot['provider_id'] ?? null) !== $snapshot['pending_provider_id']
            || ($action->request_snapshot['amount_cents'] ?? null) !== ($snapshot['pending_amount_cents'] ?? null)
            || $method === null || ($action->request_snapshot['method'] ?? null) !== $method
            || ! array_key_exists('selected_installments', $snapshot)
            || ! is_array($action->request_snapshot) || ! array_key_exists('installments', $action->request_snapshot)
            || $action->request_snapshot['installments'] !== $snapshot['selected_installments']
            || ($method === 'pix' && $snapshot['selected_installments'] !== null)
            || ($method === 'card' && (! is_int($snapshot['selected_installments']) || $snapshot['selected_installments'] < 1 || $snapshot['selected_installments'] > 6))) {
            return $this->report('receivable_attachment_requires_review', $method);
        }
        if (! is_string($order->stays_reservation_id) || ! preg_match('/^[a-f0-9]{24}$/iD', $order->stays_reservation_id)) {
            return $this->report('reservation_identity_unverified', $method);
        }
        $endpoint = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
        $reservation = $this->stays->get($endpoint);
        $payments = $this->stays->get($endpoint.'/payments');
        $accounting = $this->stays->get('/finance/accounting-transactions/'.rawurlencode($snapshot['payment_id']));
        if (! is_array($reservation) || ! is_array($payments) || ! is_array($accounting)) {
            return $this->report('stays_unavailable', $method);
        }
        if (! $this->guard->matches($reservation, $payments, $snapshot)
            || ($accounting['_id'] ?? null) !== $snapshot['payment_id']
            || ($accounting['reserveId'] ?? null) !== $order->stays_reservation_id
            || ($accounting['bankAccountId'] ?? null) !== $snapshot['pending_provider_id']
            || ($accounting['type'] ?? null) !== 'credit' || ($accounting['paid'] ?? null) !== false
            || MoneyAmount::toCents($accounting['_mcval']['BRL'] ?? null) !== ($snapshot['pending_amount_cents'] ?? null)) {
            return $this->report('receivable_changed_requires_review', $method);
        }
        if ($order->expires_at?->isFuture() !== true || ! $order->hasValidResumeToken($order->resume_token ?? '')) {
            return $this->report('expired_receivable_requires_review', $method);
        }
        if (config('direct-booking.enabled', false) !== true
            || config('direct-booking.payments_enabled', false) !== true
            || config('direct-booking.existing_reservation_checkout_enabled', false) !== true) {
            return $this->report('approval_requires_review', $method);
        }
        if ($attempts->isNotEmpty() || $order->status !== DirectBookingOrderStatus::PreReservado || $order->payment_status !== null) {
            return $this->report('payment_retry_requires_review', $method);
        }

        return $this->report('original_session_resume_only', $method, true);
    }

    /** @return array{state: string, selected_method: string|null, original_session_may_resume: bool} */
    private function report(string $state, ?string $method, bool $mayResume = false): array
    {
        return ['state' => $state, 'selected_method' => $method, 'original_session_may_resume' => $mayResume];
    }
}
