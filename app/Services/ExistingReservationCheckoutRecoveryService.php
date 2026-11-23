<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use Illuminate\Support\Facades\DB;

class ExistingReservationCheckoutRecoveryService
{
    public function __construct(
        private readonly ExistingCheckoutRecoveryCredential $credentials,
        private readonly ExistingDepositVerificationStatus $verificationStatus,
        private readonly ExperimentalExistingCycleSettlement $settlement,
    ) {}

    /**
     * @return array{kind: 'resume', reference: string, token: string, expiresAt: string|null}|array{kind: 'restart'}|array{kind: 'rejected'}
     */
    public function recover(string $code, string $secret): array
    {
        $hash = $this->credentials->hash($secret);

        return DB::transaction(function () use ($hash, $code, $secret): array {
            $credential = DB::table('existing_checkout_recovery_credentials')
                ->where('credential_hash', $hash)
                ->lockForUpdate()
                ->first();
            $order = DirectBookingOrder::query()
                ->where('existing_checkout_recovery_hash', $hash)
                ->where('origin', 'stays_existing')
                ->lockForUpdate()
                ->first();
            $snapshot = $order?->quote_snapshot['existing_reservation'] ?? null;

            if ($order && is_array($snapshot) && is_string($snapshot['reservation_code'] ?? null)
                && hash_equals($code, $snapshot['reservation_code'])
                && $order->hasValidResumeToken($order->resume_token ?? '')) {
                return [
                    'kind' => 'resume',
                    'reference' => $order->public_reference,
                    'token' => $order->resume_token,
                    'expiresAt' => $order->resume_token_expires_at?->toISOString(),
                ];
            }

            if ($order && $credential && $credential->reservation_code === $code && $credential->state === 'issued'
                && $this->canRestartSettledDepositCheckout($order, is_array($snapshot) ? $snapshot : null, $code, $secret)) {
                $revoked = DB::table('existing_checkout_recovery_credentials')
                    ->where('credential_hash', $hash)
                    ->where('reservation_code', $code)
                    ->where('state', 'issued')
                    ->update(['state' => 'revoked', 'updated_at' => now()]);

                if ($revoked === 1) {
                    return ['kind' => 'restart'];
                }
            }

            if (! $order && ! $credential && $this->credentials->valid($code, $secret)
                && $this->credentials->hasExpiredSignedIssueTime($secret)) {
                return ['kind' => 'restart'];
            }

            if ($order || ! $credential || $credential->reservation_code !== $code || $credential->state !== 'issued') {
                return ['kind' => 'rejected'];
            }

            DB::table('existing_checkout_recovery_credentials')
                ->where('credential_hash', $hash)
                ->update(['state' => 'revoked', 'updated_at' => now()]);

            return ['kind' => 'restart'];
        });
    }

    /** @param array<string, mixed>|null $snapshot */
    private function canRestartSettledDepositCheckout(
        DirectBookingOrder $order,
        ?array $snapshot,
        string $code,
        string $secret,
    ): bool {
        if (! $this->credentials->valid($code, $secret)
            || ! is_array($snapshot)
            || ($snapshot['payment_plan'] ?? null) !== 'deposit'
            || ($snapshot['selected_payment_method'] ?? null) !== 'pix'
            || ($snapshot['reservation_code'] ?? null) !== $code
            || ! is_string($snapshot['_id'] ?? null)
            || ! preg_match('/^[a-f0-9]{24}$/iD', $snapshot['_id'])
            || strtolower((string) $order->stays_reservation_id) !== strtolower($snapshot['_id'])
            || $order->origin !== 'stays_existing'
            || $order->status !== DirectBookingOrderStatus::EntradaConciliada
            || $order->payment_status !== 'approved'
            || $order->reservation_status !== 'booked'
            || ! is_string($order->resume_token)
            || $order->resume_token === ''
            || $order->resume_token_expires_at?->isPast() !== true
            || $this->verificationStatus->requiresReview(is_array($order->operational_events) ? $order->operational_events : [])) {
            return false;
        }

        $attempts = $order->paymentAttempts()->lockForUpdate()->get();
        if ($attempts->count() !== 1) {
            return false;
        }

        $attempt = $attempts->first();
        if (! $attempt instanceof DirectBookingPaymentAttempt || $attempt->status !== 'approved' || $attempt->paid_at === null
            || $attempt->payment_method !== 'pix' || ! in_array($attempt->payment_method_id, ['pix', 'cielo_pix'], true)) {
            return false;
        }

        $cycle = DB::table('existing_reservation_payment_cycles')
            ->where('direct_booking_order_id', $order->id)
            ->where('stays_reservation_id', strtolower($snapshot['_id']))
            ->where('direct_booking_payment_attempt_id', $attempt->id)
            ->where('state', 'settled')
            ->whereNull('active_reservation_id')
            ->lockForUpdate()
            ->first();

        return $cycle !== null
            && is_string($cycle->settlement_proof_hash)
            && $this->settlement->recordedProofValid($cycle);
    }
}
