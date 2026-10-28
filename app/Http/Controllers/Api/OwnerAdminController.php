<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Enums\DirectBookingOrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\DirectBookingOperationsResource;
use App\Jobs\ReconcileCieloPaymentWebhook;
use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingEmail;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Models\DirectBookingStaysAction;
use App\Models\OwnerAccess;
use App\Services\DirectStaysReservationMatcher;
use App\Services\MoneyAmount;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\StaysExternalApiClient;
use App\Services\SupabaseAuthClient;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OwnerAdminController extends Controller
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly DirectStaysReservationMatcher $reservationMatcher,
    ) {}

    public function status(Request $request): JsonResponse
    {
        $admins = config('services.hospeda.owner_admin_emails', []);
        if ($admins === []) {
            return response()->json(['success' => true, 'isAdmin' => false]);
        }
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        return response()->json(['success' => true, 'isAdmin' => in_array($guest->email, $admins, true)]);
    }

    public function requests(): JsonResponse
    {
        $requests = OwnerAccess::query()->where('status', 'pending')->orderBy('created_at')->limit(200)->get();
        $authClient = app(SupabaseAuthClient::class);

        return response()->json(['success' => true, 'requests' => $requests->map(function (OwnerAccess $item) use ($authClient): array {
            $user = $authClient->getAdminUser($item->user_id);

            return ['userId' => $item->user_id, 'fullName' => $item->full_name ?: ($user['user_metadata']['full_name'] ?? ''), 'email' => $user['email'] ?? '', 'requestedAt' => $item->created_at?->toISOString()];
        })]);
    }

    public function directBookingOrders(Request $request): JsonResponse
    {
        $input = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'webhookPage' => ['sometimes', 'integer', 'min:1', 'max:10000'],
        ]);
        $orders = DirectBookingOrder::query()
            ->where(function ($query): void {
                $query
                    ->whereIn('status', [
                        DirectBookingOrderStatus::LiberacaoPendente,
                        DirectBookingOrderStatus::AtencaoOperacional,
                        DirectBookingOrderStatus::CancelamentoSolicitado,
                        DirectBookingOrderStatus::ReembolsoPendente,
                        DirectBookingOrderStatus::Contestado,
                    ])
                    ->orWhere(function ($query): void {
                        $query->where('payment_status', 'approved')
                            ->whereNotIn('status', [DirectBookingOrderStatus::Confirmado, DirectBookingOrderStatus::Concluido]);
                    })
                    ->orWhereIn('payment_status', ['unknown', 'charged_back', 'attention_required'])
                    ->orWhere(function ($query): void {
                        $query->where('payment_status', 'refunded')
                            ->whereNotIn('status', [
                                DirectBookingOrderStatus::ReembolsoPendente,
                                DirectBookingOrderStatus::Reembolsado,
                            ]);
                    })
                    ->orWhereHas('staysActions', fn ($query) => $query->whereIn('status', ['failed', 'attention_required']))
                    ->orWhereHas('confirmationEmails', function ($query): void {
                        $query->where(fn ($query) => $query->where('status', 'failed')
                            ->whereNull('next_attempt_at'))
                            ->orWhere(fn ($query) => $query->where('status', 'pending')
                                ->where('created_at', '<=', now()->subMinutes(DirectBookingEmail::STALE_PENDING_MINUTES)))
                            ->orWhere(fn ($query) => $query->where('status', 'processing')
                                ->where('last_attempt_at', '<=', now()->subMinutes(DirectBookingEmail::STALE_PROCESSING_MINUTES)))
                            ->orWhere(fn ($query) => $query->where('status', 'queued')
                                ->where('queued_at', '<=', now()->subMinutes(DirectBookingEmail::STALE_QUEUED_MINUTES)));
                    })
                    ->orWhereHas('paymentAttempts', fn ($query) => $query->whereIn('status', ['failed', 'unknown', 'attention_required']))
                    ->orWhereHas('paymentAttempts.webhooks', fn ($query) => $query->whereIn('status', ['retrying', 'failed']));
            })
            ->with([
                'staysActions' => fn ($query) => $query
                    ->select(['id', 'direct_booking_order_id', 'action_type', 'status', 'error_code', 'error_message', 'updated_at'])
                    ->orderByDesc('updated_at'),
                'confirmationEmails' => fn ($query) => $query
                    ->select(['id', 'direct_booking_order_id', 'notification_type', 'status', 'attempts', 'last_attempt_at', 'queued_at', 'next_attempt_at', 'sent_at', 'error_code', 'created_at', 'updated_at'])
                    ->orderByDesc('updated_at'),
                'paymentAttempts' => fn ($query) => $query
                    ->select(['id', 'direct_booking_order_id', 'gateway_payment_id', 'status', 'error_code', 'updated_at'])
                    ->orderByDesc('updated_at'),
                'paymentAttempts.webhooks' => fn ($query) => $query
                    ->select(['id', 'gateway_payment_id', 'status', 'error_code', 'updated_at'])
                    ->orderByDesc('updated_at'),
            ])
            ->orderByRaw(
                'CASE
                    WHEN payment_status = ? AND status NOT IN (?, ?, ?, ?, ?, ?) THEN 0
                    WHEN status = ? THEN 1
                    WHEN status = ? OR payment_status = ? THEN 2
                    WHEN status = ? THEN 3
                    WHEN status = ? THEN 4
                    WHEN status = ? THEN 5
                    ELSE 6
                END',
                [
                    'approved',
                    DirectBookingOrderStatus::Confirmado->value,
                    DirectBookingOrderStatus::Concluido->value,
                    DirectBookingOrderStatus::CancelamentoSolicitado->value,
                    DirectBookingOrderStatus::ReembolsoPendente->value,
                    DirectBookingOrderStatus::Reembolsado->value,
                    DirectBookingOrderStatus::Contestado->value,
                    DirectBookingOrderStatus::ReembolsoPendente->value,
                    DirectBookingOrderStatus::Contestado->value,
                    'charged_back',
                    DirectBookingOrderStatus::LiberacaoPendente->value,
                    DirectBookingOrderStatus::AtencaoOperacional->value,
                    DirectBookingOrderStatus::CancelamentoSolicitado->value,
                ],
            )
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate(50, ['*'], 'page', (int) ($input['page'] ?? 1));
        $unmatchedWebhookQuery = DirectBookingPaymentWebhook::query()
            ->whereIn('status', ['received', 'retrying', 'failed', 'queued', 'processing'])
            ->whereNotIn('gateway_payment_id', DirectBookingPaymentAttempt::query()
                ->select('gateway_payment_id')
                ->whereColumn('direct_booking_payment_attempts.gateway_provider', 'direct_booking_payment_webhooks.gateway_provider')
                ->whereNotNull('gateway_payment_id'));
        $unmatchedWebhooks = (clone $unmatchedWebhookQuery)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate(50, ['id', 'gateway_payment_id', 'status', 'error_code', 'reconciliation_attempts', 'received_at', 'updated_at'], 'webhookPage', (int) ($input['webhookPage'] ?? 1));
        $unmatchedWebhookItems = $unmatchedWebhooks->getCollection()
            ->map(fn (DirectBookingPaymentWebhook $webhook): array => [
                'id' => $webhook->id,
                'gatewayPaymentId' => $webhook->gateway_payment_id,
                'status' => $webhook->status,
                'errorCode' => $webhook->error_code,
                'attempts' => $webhook->reconciliation_attempts,
                'canRetry' => $webhook->status === 'failed'
                    && $webhook->reconciliation_attempts < ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS,
                'receivedAt' => $webhook->received_at?->toISOString(),
                'updatedAt' => $webhook->updated_at?->toISOString(),
            ])
            ->values();

        return response()->json([
            'success' => true,
            'orders' => DirectBookingOperationsResource::collection(collect($orders->items()))->resolve(),
            'unmatchedWebhooks' => $unmatchedWebhookItems,
            'unmatchedWebhookTotal' => $unmatchedWebhooks->total(),
            'unmatchedWebhookCurrentPage' => $unmatchedWebhooks->currentPage(),
            'unmatchedWebhookLastPage' => $unmatchedWebhooks->lastPage(),
            'currentPage' => $orders->currentPage(),
            'lastPage' => $orders->lastPage(),
            'total' => $orders->total(),
        ])->header('Cache-Control', 'no-store, private');
    }

    public function retryDirectBookingWebhook(string $webhookId): JsonResponse
    {
        $webhook = DirectBookingPaymentWebhook::query()->findOrFail($webhookId);
        if (! in_array($webhook->gateway_provider, ['mercadopago', 'cielo_sandbox'], true)) {
            return response()->json([
                'success' => false,
                'code' => 'unknown_gateway_provider',
                'message' => 'O provedor desta notificação não é reconhecido e precisa de conferência manual.',
            ], 409);
        }
        $queueConnection = (string) config(
            $webhook->gateway_provider === 'cielo_sandbox'
                ? 'services.cielo.webhook_queue_connection'
                : 'services.mercadopago.webhook_queue_connection',
            'database',
        );
        if ($queueConnection === 'sync' || ! config("queue.connections.{$queueConnection}")) {
            return response()->json([
                'success' => false,
                'code' => 'webhook_queue_unavailable',
                'message' => 'A fila de conciliação não está disponível.',
            ], 503);
        }

        try {
            $webhook = DB::transaction(function () use ($webhookId, $queueConnection): DirectBookingPaymentWebhook {
                $webhook = DirectBookingPaymentWebhook::query()->lockForUpdate()->findOrFail($webhookId);
                $alreadyLinked = DirectBookingPaymentAttempt::query()
                    ->where('gateway_payment_id', $webhook->gateway_payment_id)
                    ->where('gateway_provider', $webhook->gateway_provider)
                    ->exists();

                if ($alreadyLinked || $webhook->status !== 'failed') {
                    abort(409, 'Esta notificação já foi associada ou não está disponível para reenvio.');
                }
                if ($webhook->reconciliation_attempts >= ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS) {
                    abort(409, 'O limite de tentativas foi atingido. A notificação precisa de conferência manual.');
                }

                $webhook->forceFill([
                    'status' => 'queued',
                    'error_code' => null,
                ])->save();

                if ($webhook->gateway_provider === 'cielo_sandbox') {
                    ReconcileCieloPaymentWebhook::dispatch($webhook->id)->onConnection($queueConnection)->afterCommit();
                } else {
                    ReconcileMercadoPagoPayment::dispatch($webhook->id)->onConnection($queueConnection)->afterCommit();
                }

                return $webhook;
            });
        } catch (ModelNotFoundException) {
            return response()->json([
                'success' => false,
                'code' => 'webhook_not_found',
                'message' => 'A notificação não foi encontrada.',
            ], 404);
        } catch (HttpException $exception) {
            return response()->json([
                'success' => false,
                'code' => 'webhook_not_retryable',
                'message' => $exception->getMessage(),
            ], $exception->getStatusCode());
        }

        return response()->json([
            'success' => true,
            'status' => 'queued',
            'message' => 'A notificação foi reenviada para conciliação.',
        ], 202)->header('Cache-Control', 'no-store, private');
    }

    public function revokeDirectBookingResumeToken(Request $request, string $publicReference): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $publicReference)) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        $result = DB::transaction(function () use ($publicReference, $reviewer): string {
            $order = DirectBookingOrder::query()
                ->where('public_reference', $publicReference)
                ->lockForUpdate()
                ->first();
            if ($order === null) {
                return 'not_found';
            }
            if (! $order->revokeResumeToken($reviewer->id)) {
                return 'already_revoked';
            }

            return 'revoked';
        });

        if ($result === 'not_found') {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json([
            'success' => true,
            'status' => $result,
            'message' => $result === 'revoked'
                ? 'A credencial de retomada do visitante foi revogada.'
                : 'A credencial de retomada do visitante já estava revogada.',
        ])->header('Cache-Control', 'no-store, private');
    }

    public function startManualDirectBookingCancellation(Request $request, string $publicReference): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $publicReference)) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        $result = DB::transaction(function () use ($publicReference, $reviewer): string {
            $order = DirectBookingOrder::query()
                ->where('public_reference', $publicReference)
                ->lockForUpdate()
                ->first();
            if ($order === null) {
                return 'not_found';
            }
            if ($order->status === DirectBookingOrderStatus::ReembolsoPendente) {
                return 'already_started';
            }
            $confirmationRequiresReview = DirectBookingStaysAction::query()
                ->where('direct_booking_order_id', $order->id)
                ->whereIn('action_type', ['register_payment', 'confirm_reservation'])
                ->whereIn('status', ['pending', 'processing', 'unknown', 'attention_required'])
                ->exists();
            if ($confirmationRequiresReview) {
                return 'confirmation_requires_review';
            }

            $latePaymentAfterHold = $order->status === DirectBookingOrderStatus::AtencaoOperacional
                && $order->payment_status === 'approved'
                && $order->stays_reservation_id !== null
                && collect($order->operational_events ?? [])->contains(fn (mixed $event): bool => is_array($event)
                    && (($event['code'] ?? null) === 'payment_approved_after_hold'
                        || ($event['source'] ?? null) === 'late_or_unreserved_payment'));
            $guestCancellationRequested = $order->status === DirectBookingOrderStatus::CancelamentoSolicitado;

            if ((! $guestCancellationRequested && ! $latePaymentAfterHold)
                || $order->payment_status !== 'approved'
                || $order->stays_reservation_id === null) {
                return 'not_ready';
            }

            $approvedAttempts = DirectBookingPaymentAttempt::query()
                ->where('direct_booking_order_id', $order->id)
                ->where('status', 'approved')
                ->lockForUpdate()
                ->get();
            $approvedAttempt = $approvedAttempts->first();
            $approvedAmountCents = $approvedAttempt === null ? null : MoneyAmount::toCents($approvedAttempt->amount);
            $orderAmountCents = MoneyAmount::toCents($order->quote_total);
            if ($approvedAttempts->count() !== 1
                || $approvedAttempt->gateway_payment_id === null
                || $order->gateway_payment_id === null
                || ! hash_equals($order->gateway_payment_id, $approvedAttempt->gateway_payment_id)
                || $approvedAmountCents === null
                || $approvedAmountCents !== $orderAmountCents
                || $approvedAttempt->currency !== $order->currency
                || $order->payment_currency !== $order->currency) {
                return 'payment_mismatch';
            }

            $order->transitionTo(DirectBookingOrderStatus::ReembolsoPendente, [
                'source' => 'owner_admin_cancellation_review',
                'event' => 'manual_cancellation_processing_started',
                'code' => 'stays_cancellation_and_gateway_refund_required',
                'reason' => $latePaymentAfterHold ? 'payment_approved_after_hold' : 'guest_cancellation_requested',
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now()->toISOString(),
            ]);
            $order->save();

            return 'started';
        });

        if ($result === 'not_found') {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($result === 'not_ready') {
            return response()->json(['success' => false, 'code' => 'direct_booking_cancellation_not_ready', 'message' => 'O pedido não está em estado válido para encaminhamento manual. Nenhuma alteração foi feita.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($result === 'payment_mismatch') {
            return response()->json(['success' => false, 'code' => 'direct_booking_approved_payment_mismatch', 'message' => 'O pedido não tem uma única tentativa aprovada que corresponda ao valor, à moeda e ao ID de pagamento registrados. Nenhuma alteração foi feita.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($result === 'confirmation_requires_review') {
            return response()->json(['success' => false, 'code' => 'direct_booking_confirmation_requires_review', 'message' => 'Há uma escrita ou confirmação da Stays em andamento ou sem resultado reconciliado. Revise a fila antes de iniciar o cancelamento manual.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json([
            'success' => true,
            'status' => DirectBookingOrderStatus::ReembolsoPendente->value,
            'alreadyStarted' => $result === 'already_started',
            'requiredActions' => ['stays_cancellation', 'gateway_refund'],
            'message' => 'Encaminhamento registrado. O cancelamento na Stays e o reembolso no gateway ainda precisam ser executados e conferidos manualmente.',
        ])->header('Cache-Control', 'no-store, private');
    }

    public function verifyManualDirectBookingStaysCancellation(Request $request, string $publicReference): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $publicReference)) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        if ($order === null) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($order->status !== DirectBookingOrderStatus::ReembolsoPendente || $order->stays_reservation_id === null) {
            return response()->json(['success' => false, 'code' => 'manual_cancellation_not_ready', 'message' => 'O pedido não está pronto para verificar a baixa na Stays.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        $reservation = $this->stays->get('/booking/reservations/'.rawurlencode($order->stays_reservation_id));
        if (! is_array($reservation)) {
            return response()->json(['success' => false, 'code' => 'stays_cancellation_status_unavailable', 'message' => 'Não foi possível consultar a reserva na Stays. Nenhuma conclusão foi registrada.'], 502)
                ->header('Cache-Control', 'no-store, private');
        }
        if (! $this->reservationMatcher->matchesIdentity($reservation, $order)
            || ! in_array(strtolower((string) ($reservation['type'] ?? '')), ['canceled', 'cancelled'], true)) {
            return response()->json(['success' => false, 'code' => 'stays_cancellation_not_confirmed', 'message' => 'A Stays não confirmou o cancelamento desta reserva. Nenhuma conclusão foi registrada.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        $result = DB::transaction(function () use ($order, $reservation, $reviewer): array {
            $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($lockedOrder->status !== DirectBookingOrderStatus::ReembolsoPendente
                || $lockedOrder->stays_reservation_id !== $order->stays_reservation_id) {
                return ['status' => 'changed', 'orderStatus' => $lockedOrder->status->value];
            }

            $events = $lockedOrder->operational_events ?? [];
            $alreadyVerified = collect($events)->contains(fn (mixed $event): bool => is_array($event)
                && ($event['code'] ?? null) === 'stays_cancellation_verified');
            if (! $alreadyVerified) {
                $lockedOrder->reservation_status = 'canceled';
                $events[] = [
                    'source' => 'owner_admin_cancellation_review',
                    'event' => 'stays_cancellation_verified',
                    'code' => 'stays_cancellation_verified',
                    'external_id' => (string) ($reservation['_id'] ?? $reservation['id'] ?? $lockedOrder->stays_reservation_id),
                    'reviewed_by' => $reviewer->id,
                    'status' => $lockedOrder->status->value,
                    'at' => now()->toISOString(),
                ];
                $lockedOrder->operational_events = $events;
            }

            if ($lockedOrder->payment_status === 'refunded') {
                $lockedOrder->transitionTo(DirectBookingOrderStatus::Reembolsado, [
                    'source' => 'manual_cancellation_steps_verified',
                    'code' => 'stays_cancellation_and_gateway_refund_verified',
                    'reviewed_by' => $reviewer->id,
                ]);
            }
            $lockedOrder->save();

            return [
                'status' => $alreadyVerified ? 'already_verified' : 'verified',
                'orderStatus' => $lockedOrder->status->value,
                'gatewayRefundConfirmed' => $lockedOrder->payment_status === 'refunded',
            ];
        });

        if ($result['status'] === 'changed') {
            return response()->json(['success' => false, 'code' => 'manual_cancellation_state_changed', 'message' => 'O estado do pedido mudou durante a verificação. Atualize a fila.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json([
            'success' => true,
            'staysCancellationConfirmed' => true,
            'gatewayRefundConfirmed' => $result['gatewayRefundConfirmed'],
            'status' => $result['orderStatus'],
            'message' => $result['gatewayRefundConfirmed']
                ? 'A Stays confirmou o cancelamento e o gateway informa o estorno.'
                : 'A Stays confirmou o cancelamento. O reembolso ainda aguarda confirmação autoritativa do gateway.',
        ])->header('Cache-Control', 'no-store, private');
    }

    public function verifyManualDirectBookingGatewayRefund(
        Request $request,
        string $publicReference,
        DirectCheckoutPaymentService $payments,
    ): JsonResponse {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $publicReference)) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        if ($order === null) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($order->status !== DirectBookingOrderStatus::ReembolsoPendente || $order->gateway_payment_id === null) {
            return response()->json(['success' => false, 'code' => 'manual_refund_not_ready', 'message' => 'O pedido não está pronto para verificar o estorno no Mercado Pago.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        try {
            $reconciliation = $payments->reconcileGatewayPayment($order->gateway_payment_id);
        } catch (\Throwable) {
            return response()->json(['success' => false, 'code' => 'gateway_refund_status_unavailable', 'message' => 'Não foi possível consultar o pagamento no Mercado Pago. Nenhuma confirmação foi registrada.'], 502)
                ->header('Cache-Control', 'no-store, private');
        }

        $order->refresh();
        $attempt = $reconciliation['attempt'];
        $refundConfirmed = $reconciliation['code'] === 'attention_required'
            && $reconciliation['gatewayStatus'] === 'refunded'
            && $attempt !== null
            && $attempt->direct_booking_order_id === $order->id
            && $attempt->gateway_payment_id === $order->gateway_payment_id
            && $attempt->gateway_status === 'refunded'
            && $order->payment_status === 'refunded';
        if ($refundConfirmed) {
            $gatewayPaymentId = $attempt->gateway_payment_id;
            $refundVerificationRecorded = DB::transaction(function () use ($order, $reviewer, $gatewayPaymentId): bool {
                $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
                if ($lockedOrder->payment_status !== 'refunded'
                    || $lockedOrder->gateway_payment_id !== $gatewayPaymentId) {
                    return false;
                }

                $events = $lockedOrder->operational_events ?? [];
                $alreadyReviewed = collect($events)->contains(fn (mixed $event): bool => is_array($event)
                    && ($event['code'] ?? null) === 'manual_gateway_refund_verified');
                if ($alreadyReviewed) {
                    return true;
                }

                $events[] = [
                    'source' => 'owner_admin_gateway_refund_verification',
                    'event' => 'manual_gateway_refund_verified',
                    'code' => 'manual_gateway_refund_verified',
                    'payment_id' => $lockedOrder->gateway_payment_id,
                    'reviewed_by' => $reviewer->id,
                    'at' => now()->toISOString(),
                ];
                $lockedOrder->operational_events = $events;
                $lockedOrder->save();

                return true;
            });
            $order->refresh();
            $refundConfirmed = $refundVerificationRecorded
                && $order->payment_status === 'refunded'
                && $order->gateway_payment_id === $gatewayPaymentId;
        }

        return response()->json([
            'success' => $refundConfirmed,
            'code' => $refundConfirmed ? null : 'gateway_refund_not_confirmed',
            'gatewayRefundConfirmed' => $refundConfirmed,
            'status' => $order->status->value,
            'message' => $refundConfirmed
                ? 'O Mercado Pago confirmou o estorno.'
                : 'A resposta atual do Mercado Pago não confirma o estorno deste pedido ou exige revisão. Nenhuma confirmação foi registrada.',
        ], $refundConfirmed ? 200 : 409)->header('Cache-Control', 'no-store, private');
    }

    public function staysOwners(Request $request): JsonResponse
    {
        $query = mb_strtolower(trim((string) $request->query('q', '')));
        if (mb_strlen($query) < 2 || mb_strlen($query) > 160) {
            return response()->json(['success' => false, 'code' => 'owner_search_invalid', 'message' => 'Digite ao menos 2 caracteres para pesquisar.'], 400);
        }
        $owners = $this->stays->ownerDirectory();
        if (! is_array($owners)) {
            return response()->json(['success' => false, 'code' => 'stays_owners_unavailable', 'message' => 'A lista de proprietários não pôde ser carregada da Stays.'], 502);
        }
        $matches = collect($owners)->map(fn (array $owner): array => ['id' => (string) ($owner['_id'] ?? $owner['id'] ?? ''), 'name' => (string) ($owner['name'] ?? trim(($owner['fName'] ?? '').' '.($owner['lName'] ?? '')))])
            ->filter(fn (array $owner): bool => str_contains(mb_strtolower($owner['id'].' '.$owner['name']), $query))->take(50)->values();

        return response()->json(['success' => true, 'owners' => $matches, 'total' => $matches->count()]);
    }

    public function approve(Request $request): JsonResponse
    {
        $input = $request->validate(['userId' => ['required', 'uuid'], 'staysOwnerId' => ['required', 'string', 'max:160'], 'identityVerified' => ['required', 'accepted']]);
        $owner = OwnerAccess::query()->find($input['userId']);
        if (! $owner) {
            return response()->json(['success' => false, 'code' => 'owner_request_not_found', 'message' => 'A solicitação não foi encontrada.'], 404);
        }
        if ($owner->status !== 'pending') {
            return response()->json(['success' => false, 'code' => 'owner_request_not_pending', 'message' => 'Esta solicitação já foi analisada.'], 409);
        }
        $owners = $this->stays->ownerDirectory();
        $staysOwner = collect(is_array($owners) ? $owners : [])->first(fn (array $item): bool => (string) ($item['_id'] ?? $item['id'] ?? '') === $input['staysOwnerId']);
        if (! $staysOwner) {
            return response()->json(['success' => false, 'code' => 'stays_owner_not_found', 'message' => 'O proprietário selecionado não foi encontrado na lista atual da Stays.'], 400);
        }
        if (OwnerAccess::query()->where('stays_owner_id', $input['staysOwnerId'])->where('user_id', '!=', $input['userId'])->exists()) {
            return response()->json(['success' => false, 'code' => 'stays_owner_already_linked', 'message' => 'Este proprietário já está vinculado a outra conta do site.'], 409);
        }
        $reviewer = request()->attributes->get('verified_guest');
        $updated = OwnerAccess::query()->where('user_id', $input['userId'])->where('status', 'pending')->update(['status' => 'approved', 'stays_owner_id' => $input['staysOwnerId'], 'approved_at' => now(), 'reviewed_at' => now(), 'reviewed_by' => $reviewer instanceof VerifiedGuest ? $reviewer->id : null]);
        if ($updated !== 1) {
            return response()->json(['success' => false, 'code' => 'owner_approval_failed', 'message' => 'Não foi possível concluir a aprovação; atualize a lista e tente novamente.'], 409);
        }

        return response()->json(['success' => true, 'status' => 'approved']);
    }
}
