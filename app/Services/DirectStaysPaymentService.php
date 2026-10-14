<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class DirectStaysPaymentService
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly DirectStaysReservationMatcher $reservationMatcher,
    ) {}

    /** @return array{ready: bool, code: string, message: string} */
    public function confirmPaidReservation(DirectBookingOrder $order): array
    {
        $order->refresh();
        if ($order->status === DirectBookingOrderStatus::Contestado || $order->payment_status === 'charged_back') {
            return $this->result(false, 'gateway_chargeback_requires_review', 'A contestação do pagamento exige revisão operacional; nenhuma confirmação automática foi iniciada.');
        }

        if (! config('direct-booking.confirmation_enabled', false)) {
            return $this->result(false, 'stays_confirmation_disabled', 'A confirmação automática na Stays permanece desabilitada.');
        }

        if (! $this->stays->isConfigured()) {
            return $this->attention($order, 'stays_not_configured', 'A Stays não está configurada para confirmar este pedido pago.');
        }

        if ($order->payment_status !== 'approved' || $order->stays_reservation_id === null || $order->expires_at === null) {
            return $this->attention($order, 'paid_order_not_confirmable', 'O pagamento ou a pré-reserva não está em estado confirmado para continuar.');
        }

        $approvedAttempts = DirectBookingPaymentAttempt::query()
            ->where('direct_booking_order_id', $order->id)
            ->where('status', 'approved')
            ->get();
        if ($approvedAttempts->count() !== 1) {
            return $this->attention($order, 'approved_payment_attempt_ambiguous', 'O pedido não tem exatamente uma tentativa aprovada; a confirmação foi interrompida.');
        }

        $attempt = $approvedAttempts->first();
        $attemptAmountCents = MoneyAmount::toCents($attempt->amount);
        $orderAmountCents = MoneyAmount::toCents($order->quote_total);
        if ($attempt->gateway_payment_id === null
            || $attemptAmountCents === null
            || $attemptAmountCents !== $orderAmountCents
            || $attempt->currency !== $order->currency
            || $order->currency !== 'BRL') {
            return $this->attention($order, 'approved_payment_mismatch', 'O pagamento aprovado não corresponde ao valor e moeda congelados no pedido.');
        }

        $reservationEndpoint = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
        $reservation = $this->stays->get($reservationEndpoint);
        if (! is_array($reservation) || ! $this->matchesReservationForConfirmation($reservation, $order)) {
            return $this->attention($order, 'stays_reservation_mismatch', 'A reserva consultada na Stays não corresponde ao imóvel, datas, hóspedes e valores do pedido.');
        }

        $paymentResult = $this->ensureStaysPaymentRecorded($order, $attempt);
        if (! $paymentResult['ready']) {
            return $paymentResult;
        }

        $reservation = $this->stays->get($reservationEndpoint);
        if (! is_array($reservation) || ! $this->matchesReservationForConfirmation($reservation, $order)) {
            return $this->attention($order, 'stays_reservation_changed_during_confirmation', 'A reserva mudou após o lançamento do pagamento na Stays; a confirmação foi interrompida para revisão operacional.');
        }

        if (($reservation['type'] ?? null) === 'booked') {
            $action = $this->action($order, 'confirm_reservation', ['type' => 'booked']);
            if ($action->status !== 'succeeded') {
                $this->markActionSucceeded($action, (string) $order->stays_reservation_id, $this->safeReservationSnapshot($reservation));
            }

            return $this->markConfirmed($order, $reservation);
        }
        if (($reservation['type'] ?? null) !== 'reserved') {
            return $this->attention($order, 'stays_reservation_not_bookable', 'A reserva Stays não está em estado reserved; a confirmação automática foi interrompida.');
        }
        if ($order->expires_at->isPast()) {
            return $this->attention($order, 'payment_approved_after_hold', 'O pagamento foi aprovado após o prazo interno da pré-reserva; a confirmação exige conferência operacional.');
        }

        return $this->confirmReservationType($order, $reservationEndpoint, $reservation);
    }

    /** @return array{ready: bool, code: string, message: string} */
    private function ensureStaysPaymentRecorded(DirectBookingOrder $order, DirectBookingPaymentAttempt $attempt): array
    {
        $paymentType = config('direct-booking.stays_payment_type');
        $providerId = config('direct-booking.stays_payment_provider_id');
        if (! in_array($paymentType, ['credit', 'debit'], true) || ! is_string($providerId) || trim($providerId) === '') {
            return $this->attention($order, 'stays_payment_mapping_unconfigured', 'O tipo e o provedor do lançamento financeiro Stays ainda não foram aprovados e configurados.');
        }

        $marker = 'CRCN_DIRECT_ORDER:'.$order->id.':MP:'.$attempt->gateway_payment_id;
        $paidAt = $attempt->paid_at?->toDateString() ?? now()->toDateString();
        $payload = [
            'type' => $paymentType,
            '_f_val' => (float) $attempt->amount,
            'status' => 'completed',
            'expirationDate' => $attempt->expires_at?->toDateString() ?? $paidAt,
            'paymentDate' => $paidAt,
            'name' => 'CRCN Mercado Pago',
            'desc' => $marker,
        ];
        $payload['_idpaymentProvider'] = trim($providerId);

        $endpoint = '/booking/reservations/'.rawurlencode((string) $order->stays_reservation_id).'/payments';
        $payments = $this->findPayments($endpoint);
        if ($payments === null) {
            return $this->attention($order, 'stays_payment_lookup_failed', 'Não foi possível consultar os lançamentos da reserva Stays.');
        }

        $matches = collect($payments)->filter(fn (array $payment): bool => ($payment['desc'] ?? null) === $marker)->values();
        if ($matches->count() > 1) {
            return $this->attention($order, 'stays_payment_duplicate', 'Há mais de um lançamento Stays para o pagamento; a confirmação foi interrompida.');
        }

        $action = $this->action($order, 'register_payment', $payload);
        if ($matches->count() === 1) {
            if (! $this->matchesPayment($matches->first(), $attempt)) {
                return $this->markAttention($action, $order, 'stays_payment_mismatch', 'O lançamento encontrado na Stays não corresponde ao valor e estado aprovados.');
            }

            $this->markActionSucceeded($action, (string) ($matches->first()['_id'] ?? ''), $this->safePaymentSnapshot($matches->first()));

            return $this->result(true, 'stays_payment_recorded', 'O pagamento aprovado está registrado na Stays.');
        }

        if ($action->attempt_count > 0 || ! in_array($action->status, ['pending'], true)) {
            return $this->markAttention($action, $order, 'stays_payment_write_unknown', 'A escrita anterior do pagamento não pode ser reconciliada; não será repetida automaticamente.');
        }

        $claim = $this->claim($action);
        if (! $claim['claimed']) {
            return $this->result(false, $claim['status'], 'O lançamento do pagamento Stays já está em andamento ou requer revisão.');
        }

        $response = $this->stays->request('POST', $endpoint, payload: $payload);
        if ($response?->successful()) {
            $createdPayment = $response->json();
            if (is_array($createdPayment) && $this->matchesPayment($createdPayment, $attempt) && ($createdPayment['desc'] ?? null) === $marker) {
                $this->markActionSucceeded($action, (string) ($createdPayment['_id'] ?? ''), $this->safePaymentSnapshot($createdPayment));

                return $this->result(true, 'stays_payment_recorded', 'O pagamento aprovado está registrado na Stays.');
            }
        }

        $paymentsAfterWrite = $this->findPayments($endpoint);
        $reconciled = $paymentsAfterWrite === null
            ? collect()
            : collect($paymentsAfterWrite)->filter(fn (array $payment): bool => ($payment['desc'] ?? null) === $marker)->values();
        if ($reconciled->count() === 1 && $this->matchesPayment($reconciled->first(), $attempt)) {
            $this->markActionSucceeded($action, (string) ($reconciled->first()['_id'] ?? ''), $this->safePaymentSnapshot($reconciled->first()));

            return $this->result(true, 'stays_payment_recorded', 'O pagamento aprovado foi localizado na Stays após a escrita.');
        }

        return $this->markAttention($action, $order, 'stays_payment_write_unknown', 'A Stays não confirmou o lançamento do pagamento; nenhuma repetição automática será feita.');
    }

    /** @return array{ready: bool, code: string, message: string} */
    private function confirmReservationType(DirectBookingOrder $order, string $endpoint, array $reservation): array
    {
        $action = $this->action($order, 'confirm_reservation', ['type' => 'booked']);
        if ($action->status === 'succeeded') {
            return $this->markAttention($action, $order, 'stays_booking_state_regressed', 'A reserva voltou a reserved após confirmação anterior; revisão operacional necessária.');
        }

        $claim = $this->claim($action);
        if (! $claim['claimed']) {
            return $this->result(false, $claim['status'], 'A confirmação Stays já está em andamento ou requer revisão.');
        }

        if ($claim['previousAttempts'] > 0) {
            return $this->markAttention($action, $order, 'stays_booking_write_unknown', 'A confirmação anterior não foi concluída; a alteração não será repetida sem revisão.');
        }

        $this->stays->request('PATCH', $endpoint, payload: ['type' => 'booked']);
        $verified = $this->stays->get($endpoint);
        if (! is_array($verified) || ! $this->matchesBookedReservation($verified, $order)) {
            return $this->markAttention($action, $order, 'stays_booking_not_confirmed', 'A Stays não confirmou type=booked após a alteração.');
        }

        $safeSnapshot = $this->safeReservationSnapshot($verified);
        $this->markActionSucceeded($action, (string) $order->stays_reservation_id, $safeSnapshot);

        return $this->markConfirmed($order, $verified);
    }

    /** @return array<int, array<string, mixed>>|null */
    private function findPayments(string $endpoint): ?array
    {
        $response = $this->stays->get($endpoint);
        if (! is_array($response)) {
            return null;
        }

        if (array_is_list($response)) {
            $payments = $response;
        } else {
            $payments = $response['payments'] ?? $response['data'] ?? null;
        }
        if (! is_array($payments)) {
            return null;
        }

        if (! array_is_list($payments)) {
            return null;
        }

        foreach ($payments as $payment) {
            if (! is_array($payment)) {
                return null;
            }
        }

        return array_values($payments);
    }

    /** @param array<string, mixed> $payment */
    private function matchesPayment(array $payment, DirectBookingPaymentAttempt $attempt): bool
    {
        $paymentAmountCents = MoneyAmount::toCents($payment['_f_val'] ?? null);
        $attemptAmountCents = MoneyAmount::toCents($attempt->amount);

        return $paymentAmountCents !== null
            && $attemptAmountCents !== null
            && $paymentAmountCents === $attemptAmountCents
            && ($payment['status'] ?? null) === 'completed'
            && ($payment['type'] ?? null) === config('direct-booking.stays_payment_type')
            && (string) ($payment['_idpaymentProvider'] ?? '') === (string) config('direct-booking.stays_payment_provider_id');
    }

    /** @param array<string, mixed> $reservation */
    private function matchesReservationForConfirmation(array $reservation, DirectBookingOrder $order): bool
    {
        if (! $this->reservationMatcher->matchesIdentity($reservation, $order)) {
            return false;
        }

        return match ($reservation['type'] ?? null) {
            'reserved' => $this->reservationMatcher->matchesCommercialDetails($reservation, $order),
            'booked' => $this->reservationMatcher->matchesProvidedCommercialDetails($reservation, $order),
            default => false,
        };
    }

    /** @param array<string, mixed> $reservation */
    private function matchesBookedReservation(array $reservation, DirectBookingOrder $order): bool
    {
        return ($reservation['type'] ?? null) === 'booked'
            && $this->reservationMatcher->matchesIdentity($reservation, $order)
            && $this->reservationMatcher->matchesProvidedCommercialDetails($reservation, $order);
    }

    /** @param array<string, mixed> $reservation
     * @return array{ready: bool, code: string, message: string}
     */
    private function markConfirmed(DirectBookingOrder $order, array $reservation): array
    {
        $snapshot = $this->safeReservationSnapshot($reservation);
        DB::transaction(function () use ($order, $snapshot): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $paymentStillApproved = $lockedOrder->payment_status === 'approved';
            $canConfirmLocally = in_array($lockedOrder->status, [
                DirectBookingOrderStatus::PagoEmConfirmacao,
                DirectBookingOrderStatus::AtencaoOperacional,
                DirectBookingOrderStatus::Confirmado,
            ], true);
            if ($paymentStillApproved && $canConfirmLocally && $lockedOrder->status !== DirectBookingOrderStatus::Confirmado) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::Confirmado, ['source' => 'stays_booked_verified', 'external_id' => $lockedOrder->stays_reservation_id]);
            } elseif ((! $paymentStillApproved || ! $canConfirmLocally)
                && $lockedOrder->status !== DirectBookingOrderStatus::Contestado) {
                if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                    $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'stays_booked_requires_review']);
                }
            }
            $lockedOrder->reservation_status = 'booked';
            $requiresReview = ! $paymentStillApproved || ! $canConfirmLocally;
            $events = $lockedOrder->operational_events ?? [];
            $event = [
                'event' => $paymentStillApproved && $canConfirmLocally ? 'stays_booked_confirmed' : 'stays_booked_requires_review',
                'at' => now()->toISOString(),
                'snapshot' => $snapshot,
            ];
            if ($requiresReview) {
                $event['source'] = 'stays';
                $event['status'] = $lockedOrder->status->value;
                $event['code'] = 'stays_booked_requires_review';
            }
            $events[] = $event;
            $lockedOrder->operational_events = $events;
            $lockedOrder->save();
        });

        $order->refresh();
        if ($order->status !== DirectBookingOrderStatus::Confirmado) {
            return $this->result(false, 'confirmation_state_changed', 'A reserva foi verificada, mas o estado local requer reconciliação.');
        }

        return $this->result(true, 'booking_confirmed', 'Pagamento aprovado e reserva Stays confirmada.');
    }

    /** @param array<string, mixed> $payment
     * @return array<string, mixed>
     */
    private function safePaymentSnapshot(array $payment): array
    {
        return array_intersect_key($payment, array_flip(['_id', '_idpaymentProvider', 'type', '_f_val', 'status', 'expirationDate', 'paymentDate', 'name', 'desc']));
    }

    /** @param array<string, mixed> $reservation
     * @return array<string, mixed>
     */
    private function safeReservationSnapshot(array $reservation): array
    {
        return array_intersect_key($reservation, array_flip(['_id', 'id', 'partnerCode', '_idlisting', '_idclient', 'type', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'guests', 'guestsDetails', 'price', 'internalNote']));
    }

    private function action(DirectBookingOrder $order, string $type, array $payload): DirectBookingStaysAction
    {
        try {
            return DirectBookingStaysAction::query()->firstOrCreate(
                ['direct_booking_order_id' => $order->id, 'action_type' => $type],
                ['status' => 'pending', 'idempotency_key' => 'direct-booking:'.$order->id.':'.$type, 'request_snapshot' => $payload],
            );
        } catch (UniqueConstraintViolationException) {
            return DirectBookingStaysAction::query()->where('direct_booking_order_id', $order->id)->where('action_type', $type)->firstOrFail();
        }
    }

    /** @return array{claimed: bool, status: string, previousAttempts: int} */
    private function claim(DirectBookingStaysAction $action): array
    {
        return DB::transaction(function () use ($action): array {
            $locked = DirectBookingStaysAction::query()->lockForUpdate()->findOrFail($action->id);
            $previousAttempts = $locked->attempt_count;
            $previousStatus = $locked->status;
            $timeout = max(10, (int) config('direct-booking.reservation_claim_timeout_seconds', 60));
            if (in_array($previousStatus, ['processing', 'attention_required'], true) && $locked->last_attempt_at?->greaterThan(now()->subSeconds($timeout))) {
                return ['claimed' => false, 'status' => 'processing', 'previousAttempts' => $previousAttempts];
            }
            if (in_array($previousStatus, ['succeeded', 'failed'], true)) {
                return ['claimed' => false, 'status' => $previousStatus, 'previousAttempts' => $previousAttempts];
            }

            $locked->status = 'processing';
            $locked->attempt_count++;
            $locked->last_attempt_at = now();
            $locked->save();

            return ['claimed' => true, 'status' => 'processing', 'previousAttempts' => $previousAttempts];
        });
    }

    /** @param array<string, mixed> $snapshot */
    private function markActionSucceeded(DirectBookingStaysAction $action, string $externalId, array $snapshot): void
    {
        $action->forceFill([
            'status' => 'succeeded',
            'external_id' => $externalId !== '' ? $externalId : null,
            'response_snapshot' => $snapshot,
            'error_code' => null,
            'error_message' => null,
            'completed_at' => now(),
        ])->save();
    }

    /** @return array{ready: bool, code: string, message: string} */
    private function markAttention(DirectBookingStaysAction $action, DirectBookingOrder $order, string $code, string $message): array
    {
        $action->forceFill([
            'status' => 'attention_required',
            'attention_required_at' => now(),
            'error_code' => $code,
            'error_message' => $message,
        ])->save();

        return $this->attention($order, $code, $message);
    }

    /** @return array{ready: bool, code: string, message: string} */
    private function attention(DirectBookingOrder $order, string $code, string $message): array
    {
        DB::transaction(function () use ($order, $code): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if (! in_array($lockedOrder->status, [
                DirectBookingOrderStatus::AtencaoOperacional,
                DirectBookingOrderStatus::Expirado,
                DirectBookingOrderStatus::Contestado,
            ], true)) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'stays_payment_confirmation', 'code' => $code]);
            }
            $events = $lockedOrder->operational_events ?? [];
            $lastEvent = $events[array_key_last($events)] ?? null;
            if (($lastEvent['event'] ?? null) !== 'stays_payment_confirmation_attention' || ($lastEvent['code'] ?? null) !== $code) {
                $events[] = ['event' => 'stays_payment_confirmation_attention', 'at' => now()->toISOString(), 'code' => $code];
            }
            $lockedOrder->operational_events = $events;
            $lockedOrder->save();
        });

        return $this->result(false, $code, $message);
    }

    /** @return array{ready: bool, code: string, message: string} */
    private function result(bool $ready, string $code, string $message): array
    {
        return ['ready' => $ready, 'code' => $code, 'message' => $message];
    }
}
