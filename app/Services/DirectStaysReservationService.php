<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingStaysAction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class DirectStaysReservationService
{
    private const PAYMENT_ATTEMPT_RECONCILIATION_STATUSES = ['pending', 'in_process', 'approved', 'unknown', 'attention_required'];

    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly DirectStaysPaymentService $payments,
        private readonly DirectStaysReservationMatcher $reservationMatcher,
    ) {}

    /** @return array{ready: bool, code: string, message: string} */
    public function reserve(DirectBookingOrder $order): array
    {
        $holdMinutes = filter_var(config('direct-booking.reservation_hold_minutes'), FILTER_VALIDATE_INT);
        if ($holdMinutes === false || $holdMinutes < 1 || $holdMinutes > 1440) {
            return $this->result(false, 'reservation_hold_unconfigured', 'A duração da pré-reserva ainda não foi aprovada e configurada. Nenhuma reserva foi iniciada.');
        }

        if (! $this->stays->isConfigured()) {
            return $this->attention($order, 'stays_not_configured', 'A Stays não está configurada; nenhuma pré-reserva foi iniciada.');
        }

        if ($order->stays_reservation_id !== null) {
            return $this->adoptReservation($order, $order->stays_reservation_id, $holdMinutes);
        }

        $clientResult = $this->resolveClient($order);
        if (! $clientResult['ready']) {
            return $this->attention($order, $clientResult['code'], $clientResult['message']);
        }

        $order->stays_client_id = $clientResult['clientId'];
        $order->save();

        $correlation = $this->reservationCorrelation($order);
        $payload = [
            'type' => 'reserved',
            'listingId' => $order->stays_listing_id,
            'checkInDate' => $order->check_in->toDateString(),
            'checkOutDate' => $order->check_out->toDateString(),
            '_idclient' => $clientResult['clientId'],
            'guests' => (int) $order->guests['adults'] + (int) $order->guests['children'] + (int) $order->guests['infants'],
            'guestsDetails' => [
                'adults' => (int) $order->guests['adults'],
                'children' => (int) $order->guests['children'],
                'infants' => (int) $order->guests['infants'],
            ],
            'price' => ['currency' => $order->currency, '_f_expected' => (float) $order->quote_total],
            'internalNote' => $correlation,
        ];
        $action = $this->action($order, 'create_reservation', $payload);
        if ($action->status === 'succeeded' && $action->external_id !== null) {
            return $this->adoptReservation($order, $action->external_id, $holdMinutes);
        }
        $claim = $this->claim($action);
        if (! $claim['claimed']) {
            return $this->result(false, $claim['status'], 'A tentativa de pré-reserva já está em andamento ou requer conferência operacional.');
        }

        if ($claim['previousStatus'] !== 'pending' || $claim['previousAttempts'] > 0) {
            $reservation = $this->findReservationByCorrelation($order, $correlation);
            if ($reservation !== null) {
                return $this->adoptReservation($order, $this->reservationId($reservation), $holdMinutes, $action, $reservation);
            }

            return $this->markAttention($action, $order, 'reservation_write_outcome_unknown', 'A escrita anterior não pode ser localizada com segurança; não foi repetida para evitar reserva duplicada.');
        }

        $response = $this->stays->request('POST', '/booking/reservations', payload: $payload);
        if ($response?->status() === 201) {
            $reservation = $response->json();
            if (is_array($reservation) && $this->reservationMatcher->matchesIdentity($reservation, $order)) {
                return $this->adoptReservation($order, $this->reservationId($reservation), $holdMinutes, $action, $reservation);
            }
        }

        if ($response !== null && $response->clientError() && $response->status() !== 408 && $response->status() !== 429) {
            $action->forceFill([
                'status' => 'failed',
                'error_code' => 'stays_reservation_rejected',
                'error_message' => 'A Stays rejeitou a criação da pré-reserva. Verifique os dados e o contrato da conta.',
            ])->save();

            return $this->attention($order, 'stays_reservation_rejected', 'A Stays rejeitou a pré-reserva. Nenhuma cobrança foi iniciada.');
        }

        $reservation = $this->findReservationByCorrelation($order, $correlation);
        if ($reservation !== null) {
            return $this->adoptReservation($order, $this->reservationId($reservation), $holdMinutes, $action, $reservation);
        }

        return $this->markAttention($action, $order, 'stays_reservation_write_unknown', 'A resposta da Stays não confirmou a escrita e a consulta não encontrou correlação única. A escrita não será repetida automaticamente.');
    }

    /** @return array{processed: int, attention: int} */
    public function recover(): array
    {
        $paymentRecovery = $this->payments->recoverPendingPayments();
        $processed = $paymentRecovery['processed'];
        $attention = $paymentRecovery['attention'];
        $holdMinutes = filter_var(config('direct-booking.reservation_hold_minutes'), FILTER_VALIDATE_INT);
        if ($holdMinutes === false || $holdMinutes < 1 || $holdMinutes > 1440 || ! $this->stays->isConfigured()) {
            return compact('processed', 'attention');
        }

        $staleBefore = now()->subSeconds(max(10, (int) config('direct-booking.reservation_claim_timeout_seconds', 60)));
        DirectBookingStaysAction::query()
            ->with('order')
            ->whereIn('action_type', ['create_client', 'create_reservation', 'cancel_reservation'])
            ->where(function ($query) use ($staleBefore): void {
                $query->whereIn('status', ['pending', 'unknown', 'attention_required'])
                    ->orWhere(fn ($query) => $query->where('status', 'processing')->where('last_attempt_at', '<=', $staleBefore));
            })
            ->orderBy('created_at')
            ->limit(100)
            ->get()
            ->each(function (DirectBookingStaysAction $action) use (&$processed, &$attention): void {
                $result = match ($action->action_type) {
                    'create_client', 'create_reservation' => $this->reserve($action->order),
                    'cancel_reservation' => $this->release($action->order),
                    default => $this->result(false, 'unsupported_action', 'Tipo de ação Stays não suportado.'),
                };
                $processed++;
                if (! $result['ready']) {
                    $attention++;
                }
            });

        DirectBookingOrder::query()
            ->whereNotNull('stays_reservation_id')
            ->where(function ($query): void {
                $query->whereIn('status', [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::PagamentoRecusado])
                    ->orWhere('status', DirectBookingOrderStatus::AtencaoOperacional);
            })
            ->where(function ($query): void {
                $query->whereNull('payment_status')
                    ->orWhereNotIn('payment_status', self::PAYMENT_ATTEMPT_RECONCILIATION_STATUSES);
            })
            ->whereDoesntHave('paymentAttempts', fn ($query) => $query->whereIn('status', array_merge(['processing'], self::PAYMENT_ATTEMPT_RECONCILIATION_STATUSES)))
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->orderBy('expires_at')
            ->limit(100)
            ->get()
            ->each(function (DirectBookingOrder $order) use (&$processed, &$attention): void {
                $result = $this->release($order);
                $processed++;
                if (! $result['ready']) {
                    $attention++;
                }
            });

        if (config('direct-booking.confirmation_enabled', false)) {
            DirectBookingOrder::query()
                ->whereIn('status', [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::AtencaoOperacional])
                ->where('payment_status', 'approved')
                ->whereIn('reservation_status', ['reserved', 'booked'])
                ->whereNotNull('stays_reservation_id')
                ->orderBy('updated_at')
                ->limit(100)
                ->get()
                ->each(function (DirectBookingOrder $order) use (&$processed, &$attention): void {
                    $result = $this->payments->confirmPaidReservation($order);
                    $processed++;
                    if (! $result['ready']) {
                        $attention++;
                    }
                });
        }

        return ['processed' => $processed, 'attention' => $attention];
    }

    /** @return array{ready: bool, code: string, message: string} */
    public function release(DirectBookingOrder $order): array
    {
        if ($order->stays_reservation_id === null) {
            return $this->attention($order, 'reservation_id_missing', 'Não há ID Stays para confirmar a liberação da unidade.');
        }

        if ($this->paymentRequiresReconciliation($order)) {
            return $this->attention($order, 'payment_state_requires_reconciliation', 'A situação do pagamento exige conciliação antes de liberar a unidade.');
        }

        $releaseError = DB::transaction(function () use ($order): ?string {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($this->paymentRequiresReconciliation($lockedOrder)) {
                return 'payment_state_requires_reconciliation';
            }
            if (! in_array($lockedOrder->status, [
                DirectBookingOrderStatus::PreReservado,
                DirectBookingOrderStatus::PagamentoRecusado,
                DirectBookingOrderStatus::LiberacaoPendente,
                DirectBookingOrderStatus::AtencaoOperacional,
            ], true)) {
                return 'reservation_no_longer_releasable';
            }
            if ($lockedOrder->status !== DirectBookingOrderStatus::LiberacaoPendente) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::LiberacaoPendente, ['source' => 'reservation_expiration']);
                $lockedOrder->save();
            }

            return null;
        });
        if ($releaseError !== null) {
            if ($releaseError === 'payment_state_requires_reconciliation') {
                return $this->attention($order, $releaseError, 'A tentativa de pagamento ativa exige conciliação antes de liberar a unidade.');
            }

            return $this->result(false, $releaseError, 'O estado do pedido mudou durante a liberação. Nenhum cancelamento foi enviado à Stays.');
        }

        $action = $this->action($order, 'cancel_reservation', [
            'type' => 'canceled',
            'cancelMessage' => 'Liberação da pré-reserva CRCN '.$order->id,
            'isGuestCancellationRequested' => false,
        ]);
        $claim = $this->claim($action);
        if (! $claim['claimed']) {
            return $this->result(false, $claim['status'], 'A tentativa de liberação está em andamento ou requer conferência operacional.');
        }

        $reservation = $this->stays->get('/booking/reservations/'.rawurlencode($order->stays_reservation_id));
        if (! is_array($reservation)) {
            return $this->markAttention($action, $order, 'reservation_state_unavailable', 'Não foi possível consultar o estado da pré-reserva; a unidade não foi considerada liberada.');
        }
        if (! $this->reservationMatcher->matchesIdentity($reservation, $order)) {
            return $this->markAttention($action, $order, 'reservation_identity_mismatch', 'A reserva consultada não corresponde ao hóspede, imóvel, datas e correlação deste pedido; nenhum cancelamento foi enviado.');
        }
        if (($reservation['type'] ?? null) === 'canceled') {
            return $this->markReleased($action, $order, $reservation);
        }
        if (($reservation['type'] ?? null) !== 'reserved') {
            return $this->markAttention($action, $order, 'reservation_not_releasable', 'A reserva não está em estado reserved; a liberação automática foi interrompida.');
        }

        $mayRelease = DB::transaction(function () use ($order): bool {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);

            return $lockedOrder->status === DirectBookingOrderStatus::LiberacaoPendente
                && ! $this->paymentRequiresReconciliation($lockedOrder);
        });
        if (! $mayRelease) {
            return $this->markAttention($action, $order, 'reservation_release_interrupted', 'O estado do pagamento ou pedido mudou antes do cancelamento. Nenhum novo cancelamento foi enviado à Stays.');
        }

        if ($claim['previousAttempts'] >= 3) {
            return $this->markAttention($action, $order, 'reservation_release_attempt_limit', 'A Stays continua retornando uma pré-reserva ativa após tentativas limitadas de liberação.');
        }

        $response = $this->stays->request('PATCH', '/booking/reservations/'.rawurlencode($order->stays_reservation_id), payload: $action->request_snapshot);
        $verified = $this->stays->get('/booking/reservations/'.rawurlencode($order->stays_reservation_id));
        if (is_array($verified) && ($verified['_id'] ?? $verified['id'] ?? null) === $order->stays_reservation_id
            && $this->reservationMatcher->matchesIdentity($verified, $order)
            && ($verified['type'] ?? null) === 'canceled') {
            return $this->markReleased($action, $order, $verified);
        }

        $errorCode = $response?->successful() ? 'reservation_release_unconfirmed' : 'reservation_release_failed';

        return $this->markAttention($action, $order, $errorCode, 'A Stays não confirmou o estado canceled. A unidade permanece em atenção operacional.');
    }

    public function validateReservedOrderForPayment(DirectBookingOrder $order): ?bool
    {
        if (! $this->stays->isConfigured() || $order->stays_reservation_id === null) {
            return false;
        }

        $reservation = $this->stays->get('/booking/reservations/'.rawurlencode($order->stays_reservation_id));
        if (! is_array($reservation)) {
            return null;
        }

        return ($reservation['type'] ?? null) === 'reserved'
            && $this->reservationMatcher->matches($reservation, $order);
    }

    /** @return array{ready: bool, clientId: string, code: string, message: string} */
    private function resolveClient(DirectBookingOrder $order): array
    {
        if ($order->stays_client_id !== null) {
            return ['ready' => true, 'clientId' => $order->stays_client_id, 'code' => 'client_ready', 'message' => ''];
        }

        $clients = $this->findClientsByEmail($order->guest_email);
        if ($clients === null) {
            return ['ready' => false, 'clientId' => '', 'code' => 'stays_client_lookup_failed', 'message' => 'Não foi possível consultar o cliente na Stays; nenhuma reserva foi iniciada.'];
        }

        if (count($clients) === 1) {
            return ['ready' => true, 'clientId' => $this->clientId($clients[0]), 'code' => 'client_ready', 'message' => ''];
        }
        if (count($clients) > 1) {
            return ['ready' => false, 'clientId' => '', 'code' => 'stays_client_ambiguous', 'message' => 'Há mais de um cliente com o e-mail exato na Stays; a associação requer revisão operacional.'];
        }

        $parts = preg_split('/\s+/', trim($order->guest_name), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $payload = [
            'kind' => 'person',
            'fName' => $parts[0] ?? '',
            'lName' => implode(' ', array_slice($parts, 1)),
            'email' => $order->guest_email,
            'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
        ];
        $action = $this->action($order, 'create_client', $payload);
        $claim = $this->claim($action);
        if (! $claim['claimed']) {
            return ['ready' => false, 'clientId' => '', 'code' => $claim['status'], 'message' => 'A criação do cadastro Stays está em andamento ou requer revisão operacional.'];
        }

        if ($claim['previousAttempts'] > 0 || $claim['previousStatus'] !== 'pending') {
            $clients = $this->findClientsByEmail($order->guest_email);
            if (is_array($clients) && count($clients) === 1) {
                $clientId = $this->clientId($clients[0]);
                $this->markActionSucceeded($action, $clientId, ['_id' => $clientId]);

                return ['ready' => true, 'clientId' => $clientId, 'code' => 'client_ready', 'message' => ''];
            }

            $this->markAttention($action, $order, 'stays_client_write_unknown', 'A escrita anterior do cliente não pode ser reconciliada por e-mail exato; não foi repetida.');

            return ['ready' => false, 'clientId' => '', 'code' => 'stays_client_write_unknown', 'message' => 'O cadastro Stays não pôde ser reconciliado; nenhuma reserva foi iniciada.'];
        }

        $response = $this->stays->request('POST', '/booking/clients', payload: $payload);
        if ($response?->status() === 201 && is_array($response->json())) {
            $clientId = $this->clientId($response->json());
            if ($clientId !== '') {
                $this->markActionSucceeded($action, $clientId, ['_id' => $clientId]);

                return ['ready' => true, 'clientId' => $clientId, 'code' => 'client_ready', 'message' => ''];
            }
        }

        if ($response !== null && $response->clientError() && $response->status() !== 408 && $response->status() !== 429) {
            $action->forceFill(['status' => 'failed', 'error_code' => 'stays_client_rejected', 'error_message' => 'A Stays rejeitou a criação do cliente.'])->save();

            return ['ready' => false, 'clientId' => '', 'code' => 'stays_client_rejected', 'message' => 'A Stays rejeitou o cadastro do hóspede; nenhuma reserva foi iniciada.'];
        }

        $clients = $this->findClientsByEmail($order->guest_email);
        if (is_array($clients) && count($clients) === 1) {
            $clientId = $this->clientId($clients[0]);
            $this->markActionSucceeded($action, $clientId, ['_id' => $clientId]);

            return ['ready' => true, 'clientId' => $clientId, 'code' => 'client_ready', 'message' => ''];
        }

        return $this->markAttention($action, $order, 'stays_client_write_unknown', 'A resposta da Stays não confirmou o cadastro e a busca por e-mail não encontrou resultado único.');
    }

    /** @return array<int, array<string, mixed>>|null */
    private function findClientsByEmail(string $email): ?array
    {
        $clients = $this->stays->get('/booking/clients', ['email' => $email, 'limit' => 100]);
        if (! is_array($clients)) {
            return null;
        }

        $clients = $clients['clients'] ?? $clients['data'] ?? $clients;
        if (! is_array($clients)) {
            return null;
        }

        return collect($clients)
            ->filter(fn (mixed $client): bool => is_array($client) && mb_strtolower(trim((string) ($client['email'] ?? ''))) === mb_strtolower(trim($email)))
            ->values()
            ->all();
    }

    /** @return array<string, mixed>|null */
    private function findReservationByCorrelation(DirectBookingOrder $order, string $correlation): ?array
    {
        $reservations = $this->stays->get('/booking/reservations', [
            'from' => $order->check_in->toDateString(),
            'to' => $order->check_in->toDateString(),
            'dateType' => 'arrival',
            'listingId' => $order->stays_listing_id,
            'type' => 'reserved',
            'limit' => 100,
            'skip' => 0,
        ]);
        if (! is_array($reservations)) {
            return null;
        }

        $matches = collect($reservations)
            ->filter(fn (mixed $reservation): bool => is_array($reservation)
                && $this->reservationMatcher->matchesIdentity($reservation, $order)
                && hash_equals($correlation, (string) ($reservation['internalNote'] ?? '')))
            ->values();

        return $matches->count() === 1 ? $matches->first() : null;
    }

    /** @param array<string, mixed>|null $reservation
     * @return array{ready: bool, code: string, message: string}
     */
    private function adoptReservation(DirectBookingOrder $order, string $reservationId, int $holdMinutes, ?DirectBookingStaysAction $action = null, ?array $reservation = null): array
    {
        if ($reservationId === '') {
            return $this->attention($order, 'stays_reservation_id_missing', 'A Stays não retornou identificador para a pré-reserva.');
        }

        $reservation ??= $this->stays->get('/booking/reservations/'.rawurlencode($reservationId));
        if (! is_array($reservation) || ! $this->reservationMatcher->matchesIdentity($reservation, $order)) {
            return $action
                ? $this->markAttention($action, $order, 'stays_reservation_mismatch', 'O estado retornado pela Stays não corresponde ao imóvel, às datas e à correlação do pedido.')
                : $this->attention($order, 'stays_reservation_mismatch', 'A consulta Stays não confirmou a pré-reserva correspondente ao pedido.');
        }

        $commercialDetailsVerified = $this->reservationMatcher->matchesCommercialDetails($reservation, $order);

        $safeSnapshot = array_intersect_key($reservation, array_flip(['_id', 'id', '_idlisting', '_idclient', 'type', 'checkInDate', 'checkOutDate', 'guests', 'price', 'internalNote']));
        if ($action !== null) {
            $this->markActionSucceeded($action, $reservationId, $safeSnapshot);
        }

        DB::transaction(function () use ($order, $reservationId, $safeSnapshot, $holdMinutes, $commercialDetailsVerified): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedOrder->stays_reservation_id = $reservationId;
            $lockedOrder->reservation_status = 'reserved';
            $lockedOrder->expires_at ??= now()->addMinutes($holdMinutes);
            if (! $commercialDetailsVerified && $lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'stays_reservation_details_unverified', 'external_id' => $reservationId]);
            } elseif ($commercialDetailsVerified && in_array($lockedOrder->status, [DirectBookingOrderStatus::Cotado, DirectBookingOrderStatus::AtencaoOperacional], true)) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::PreReservado, ['source' => 'stays_reservation', 'external_id' => $reservationId]);
            }
            $events = $lockedOrder->operational_events ?? [];
            $events[] = [
                'event' => $commercialDetailsVerified ? 'stays_reserved_reconciled' : 'stays_reserved_details_unverified',
                'at' => now()->toISOString(),
                'external_id' => $reservationId,
                'snapshot' => $safeSnapshot,
            ];
            $lockedOrder->operational_events = $events;
            $lockedOrder->save();
        });

        if (! $commercialDetailsVerified) {
            return $this->result(false, 'stays_reservation_details_unverified', 'A Stays não confirmou quantidade de hóspedes, valor e moeda da pré-reserva. Nenhuma cobrança será iniciada.');
        }

        return $this->result(true, 'pre_reserved', 'Pré-reserva criada e registrada. Pagamentos continuam desabilitados.');
    }

    /** @return array{ready: bool, claimed: bool, status: string, previousStatus: string, previousAttempts: int} */
    private function claim(DirectBookingStaysAction $action): array
    {
        return DB::transaction(function () use ($action): array {
            $locked = DirectBookingStaysAction::query()->lockForUpdate()->findOrFail($action->id);
            $previousStatus = $locked->status;
            $previousAttempts = $locked->attempt_count;
            $timeout = max(10, (int) config('direct-booking.reservation_claim_timeout_seconds', 60));
            if ($previousStatus === 'succeeded' || $previousStatus === 'failed') {
                return ['ready' => $previousStatus === 'succeeded', 'claimed' => false, 'status' => $previousStatus, 'previousStatus' => $previousStatus, 'previousAttempts' => $previousAttempts];
            }
            if (in_array($previousStatus, ['processing', 'attention_required'], true) && $locked->last_attempt_at?->greaterThan(now()->subSeconds($timeout))) {
                return ['ready' => false, 'claimed' => false, 'status' => 'processing', 'previousStatus' => $previousStatus, 'previousAttempts' => $previousAttempts];
            }

            $locked->status = 'processing';
            $locked->attempt_count++;
            $locked->last_attempt_at = now();
            $locked->save();

            return ['ready' => false, 'claimed' => true, 'status' => 'processing', 'previousStatus' => $previousStatus, 'previousAttempts' => $previousAttempts];
        });
    }

    /** @param array<string, mixed> $payload */
    private function action(DirectBookingOrder $order, string $type, array $payload): DirectBookingStaysAction
    {
        $key = 'direct-booking:'.$order->id.':'.$type;
        $snapshot = $payload;
        if ($type === 'create_client') {
            unset($snapshot['fName'], $snapshot['lName'], $snapshot['email']);
        }
        try {
            return DirectBookingStaysAction::query()->firstOrCreate(
                ['direct_booking_order_id' => $order->id, 'action_type' => $type],
                ['status' => 'pending', 'idempotency_key' => $key, 'request_snapshot' => $snapshot],
            );
        } catch (UniqueConstraintViolationException) {
            return DirectBookingStaysAction::query()->where('direct_booking_order_id', $order->id)->where('action_type', $type)->firstOrFail();
        }
    }

    /** @param array<string, mixed> $snapshot */
    private function markActionSucceeded(DirectBookingStaysAction $action, string $externalId, array $snapshot): void
    {
        $action->forceFill([
            'status' => 'succeeded',
            'external_id' => $externalId,
            'response_snapshot' => $snapshot,
            'error_code' => null,
            'error_message' => null,
            'completed_at' => now(),
        ])->save();
    }

    /** @param array<string, mixed> $reservation */
    private function markReleased(DirectBookingStaysAction $action, DirectBookingOrder $order, array $reservation): array
    {
        $snapshot = array_intersect_key($reservation, array_flip(['_id', 'id', '_idlisting', 'type', 'checkInDate', 'checkOutDate']));
        $this->markActionSucceeded($action, $order->stays_reservation_id ?? '', $snapshot);
        DB::transaction(function () use ($order, $snapshot): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $lockedOrder->reservation_status = 'canceled';
            if ($lockedOrder->status === DirectBookingOrderStatus::PreReservado || $lockedOrder->status === DirectBookingOrderStatus::LiberacaoPendente || $lockedOrder->status === DirectBookingOrderStatus::AtencaoOperacional) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::Expirado, ['source' => 'stays_cancel_verified']);
            }
            $events = $lockedOrder->operational_events ?? [];
            $events[] = ['event' => 'stays_release_confirmed', 'at' => now()->toISOString(), 'external_id' => $lockedOrder->stays_reservation_id, 'snapshot' => $snapshot];
            $lockedOrder->operational_events = $events;
            $lockedOrder->save();
        });

        return $this->result(true, 'reservation_released', 'A Stays retornou type=canceled. A liberação efetiva do inventário da conta ainda requer validação controlada.');
    }

    /** @param array<string, mixed> $snapshot */
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
        DB::transaction(function () use ($order, $code, $message): void {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($lockedOrder->status !== DirectBookingOrderStatus::AtencaoOperacional && $lockedOrder->status !== DirectBookingOrderStatus::Expirado) {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::AtencaoOperacional, ['source' => 'stays_reservation', 'code' => $code]);
            }
            $events = $lockedOrder->operational_events ?? [];
            $events[] = ['event' => 'stays_attention_required', 'at' => now()->toISOString(), 'code' => $code, 'message' => $message];
            $lockedOrder->operational_events = $events;
            $lockedOrder->reservation_status = $lockedOrder->stays_reservation_id === null ? 'unknown' : $lockedOrder->reservation_status;
            $lockedOrder->save();
        });

        return $this->result(false, $code, $message);
    }

    /** @return array{ready: bool, code: string, message: string} */
    private function result(bool $ready, string $code, string $message): array
    {
        return ['ready' => $ready, 'code' => $code, 'message' => $message];
    }

    private function paymentRequiresReconciliation(DirectBookingOrder $order): bool
    {
        return in_array($order->payment_status, self::PAYMENT_ATTEMPT_RECONCILIATION_STATUSES, true)
            || $order->paymentAttempts()
                ->whereIn('status', array_merge(['processing'], self::PAYMENT_ATTEMPT_RECONCILIATION_STATUSES))
                ->exists();
    }

    private function reservationCorrelation(DirectBookingOrder $order): string
    {
        return 'CRCN_DIRECT_ORDER:'.$order->id;
    }

    /** @param array<string, mixed> $reservation */
    private function reservationId(array $reservation): string
    {
        return (string) ($reservation['_id'] ?? $reservation['id'] ?? '');
    }

    /** @param array<string, mixed> $client */
    private function clientId(array $client): string
    {
        return (string) ($client['_id'] ?? $client['id'] ?? '');
    }
}
