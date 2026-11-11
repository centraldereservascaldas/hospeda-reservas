<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Enums\DirectBookingOrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\DirectBookingOrderListResource;
use App\Models\DirectBookingOrder;
use App\Models\GuestProfile;
use App\Services\DirectBookingCancellationRequestService;
use App\Services\GuestStaysSyncService;
use App\Services\ExistingReservationPaymentLock;
use App\Services\ReservationCoordinationMode;
use App\Services\ReservationReleaseGuard;
use App\Services\StaysReservationIdentity;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class GuestReservationController extends Controller
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly GuestStaysSyncService $guestSync,
    ) {}

    public function sync(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (! $this->guestSync->sync($guest)) {
            return response()->json(['success' => false, 'code' => 'stays_client_sync_failed', 'message' => 'Não foi possível sincronizar seu cadastro agora. Tente novamente em instantes.'], 502);
        }

        return response()->json(['success' => true, 'staysSynced' => true]);
    }

    public function directBookingOrders(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        $orders = DirectBookingOrder::query()
            ->where('guest_email', mb_strtolower(trim($guest->email)))
            ->latest('created_at')
            ->get();
        $data = $orders->map(fn (DirectBookingOrder $order): array => (new DirectBookingOrderListResource($order))->resolve($request));

        return response()->json([
            'success' => true,
            'data' => $data,
        ])->header('Cache-Control', 'no-store, private');
    }

    public function requestDirectBookingCancellation(
        Request $request,
        string $publicReference,
        DirectBookingCancellationRequestService $cancellations,
    ): JsonResponse {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $publicReference)) {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        $result = $cancellations->request($publicReference, $guest, '');

        if ($result['status'] === 'not_found') {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($result['status'] === 'not_cancellable') {
            return response()->json(['success' => false, 'code' => 'direct_booking_not_cancellable', 'message' => 'Este pedido não está em um estado que permita solicitar cancelamento. Nenhuma alteração foi feita.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json([
            'success' => true,
            'cancellationStatus' => 'requested',
            'alreadyRequested' => $result['status'] === 'already_requested',
            'cancellationReceipt' => $result['receipt'],
            'message' => 'A solicitação de cancelamento foi recebida para análise da Central; o cancelamento ainda não foi concluído.',
        ])->header('Cache-Control', 'no-store, private');
    }

    public function index(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $clientId = $this->clientId($guest);
        if (! $clientId) {
            return response()->json(['success' => false, 'code' => 'guest_sync_required', 'message' => 'Não foi possível localizar seu cadastro no sistema de reservas.'], 503);
        }
        $client = $this->stays->get('/booking/clients/'.rawurlencode($clientId));
        if (! is_array($client)) {
            return response()->json(['success' => false, 'code' => 'reservations_unavailable', 'message' => 'Não foi possível carregar suas reservas agora.'], 502);
        }
        $client = $client['client'] ?? $client['data'] ?? $client;
        $records = $client['reservations'] ?? $client['data']['reservations'] ?? [];
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $reservationRecords = collect(is_array($records) ? $records : []);
        $reservationIds = $reservationRecords
            ->flatMap(fn (array $record): array => array_filter([
                $record['id'] ?? null,
                $record['_id'] ?? null,
            ], fn (mixed $id): bool => is_string($id) || is_int($id)))
            ->map(fn (mixed $id): string => (string) $id)
            ->unique()
            ->values();
        $directOrders = DirectBookingOrder::query()
            ->whereIn('stays_reservation_id', $reservationIds)
            ->get();
        $data = $reservationRecords
            ->map(function (array $record) use ($catalog, $guest, $directOrders): ?array {
                $ids = collect([$record['_id'] ?? null, $record['id'] ?? null])
                    ->filter(fn (mixed $id): bool => is_string($id) || is_int($id))
                    ->map(fn (mixed $id): string => (string) $id)->unique();
                $matching = $directOrders->filter(fn (DirectBookingOrder $order): bool => $ids->contains((string) $order->stays_reservation_id))->values();
                $websiteOrders = $matching->filter(fn (DirectBookingOrder $order): bool => $order->origin !== 'stays_existing')->values();
                $order = $websiteOrders->count() === 1 ? $websiteOrders->first() : null;

                return $this->mapReservation($record, $catalog, $guest, $order);
            })
            ->filter()
            ->values();

        return response()->json(['success' => true, 'data' => $data])
            ->header('Cache-Control', 'no-store, private');
    }

    public function cancel(Request $request, string $reservationId): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if (trim($reservationId) === '' || strlen($reservationId) > 120) {
            return response()->json(['success' => false, 'code' => 'invalid_reservation_id', 'message' => 'Identificador de reserva inválido.'], 400);
        }
        $clientId = $this->clientId($guest);
        if (! $clientId) {
            return response()->json(['success' => false, 'code' => 'guest_sync_required', 'message' => 'Não foi possível validar o titular desta reserva.'], 503);
        }
        $client = $this->stays->get('/booking/clients/'.rawurlencode($clientId));
        if (! is_array($client)) {
            return response()->json(['success' => false, 'code' => 'reservation_owner_check_failed', 'message' => 'Não foi possível validar a titularidade da reserva.'], 502);
        }
        $client = $client['client'] ?? $client['data'] ?? $client;
        $records = $client['reservations'] ?? $client['data']['reservations'] ?? [];
        $reservation = collect(is_array($records) ? $records : [])->first(fn (array $item): bool => in_array($reservationId, [(string) ($item['id'] ?? ''), (string) ($item['_id'] ?? '')], true));
        if (! $reservation) {
            return response()->json(['success' => false, 'code' => 'reservation_not_found', 'message' => 'Esta reserva não foi encontrada na sua conta.'], 404);
        }
        $details = $this->stays->get('/booking/reservations/'.rawurlencode($reservationId));
        if (! is_array($details)) {
            return response()->json(['success' => false, 'code' => 'reservation_state_unavailable', 'message' => 'Não foi possível confirmar o estado atual da reserva. Nenhuma alteração foi feita.'], 502);
        }

        $detailIds = collect([
            $details['id'] ?? null,
            $details['_id'] ?? null,
            $details['partnerCode'] ?? null,
        ])->filter(fn (mixed $id): bool => is_string($id) || is_int($id))->map(fn (mixed $id): string => (string) $id)->unique()->values();
        if (! $detailIds->contains($reservationId)) {
            return response()->json(['success' => false, 'code' => 'reservation_state_mismatch', 'message' => 'Não foi possível validar a reserva. Nenhuma alteração foi feita.'], 502);
        }

        $reservationIds = $detailIds->push($reservationId)->unique()->values();
        $directOrders = DirectBookingOrder::query()->whereIn('stays_reservation_id', $reservationIds)->get();
        if ($directOrders->count() > 1 || $directOrders->contains(fn (DirectBookingOrder $order): bool => $order->origin === 'stays_existing')) {
            return response()->json(['success' => false, 'code' => 'direct_booking_cancellation_requires_support', 'message' => 'Entre em contato com o atendimento para analisar o cancelamento desta reserva e seus pagamentos.'], 409)
                ->header('Cache-Control', 'no-store, private');
        }
        $directOrder = $directOrders->first();
        $isDirectCheckoutReservation = str_starts_with((string) ($details['internalNote'] ?? ''), 'CRCN_DIRECT_ORDER:')
            || $directOrder !== null;
        if ($isDirectCheckoutReservation) {
            if ($directOrder === null) {
                return response()->json(['success' => false, 'code' => 'direct_booking_cancellation_requires_support', 'message' => 'A compra precisa ser localizada pela Central antes de registrar o cancelamento. Entre em contato com o atendimento.'], 409);
            }

            $requestRecorded = DB::transaction(function () use ($directOrder, $guest): bool {
                $lockedOrder = DirectBookingOrder::query()->lockForUpdate()->findOrFail($directOrder->id);
                if ($lockedOrder->status === DirectBookingOrderStatus::CancelamentoSolicitado) {
                    return true;
                }
                if ($lockedOrder->status !== DirectBookingOrderStatus::Confirmado || $lockedOrder->payment_status !== 'approved') {
                    return false;
                }

                $lockedOrder->transitionTo(DirectBookingOrderStatus::CancelamentoSolicitado, [
                    'source' => 'guest_cancellation_request',
                    'code' => 'guest_cancellation_requested',
                    'requested_by' => $guest->id,
                ]);
                $lockedOrder->save();

                return true;
            });
            if (! $requestRecorded) {
                return response()->json(['success' => false, 'code' => 'direct_booking_cancellation_state_conflict', 'message' => 'O estado atual da compra não permite registrar outro pedido de cancelamento. Nenhuma alteração foi feita.'], 409);
            }

            return response()->json([
                'success' => true,
                'reservationId' => $reservationId,
                'cancellationStatus' => 'requested',
                'message' => 'A solicitação foi registrada para análise da Central. A reserva continua ativa até a confirmação do cancelamento.',
            ])->header('Cache-Control', 'no-store, private');
        }

        $detailClientId = (string) ($details['_idclient'] ?? '');
        if ($detailClientId !== '' && ! hash_equals($clientId, $detailClientId)) {
            return response()->json(['success' => false, 'code' => 'reservation_not_found', 'message' => 'Esta reserva não foi encontrada na sua conta.'], 404);
        }

        $status = strtolower((string) ($details['type'] ?? ''));
        if (in_array($status, ['canceled', 'cancelled'], true)) {
            return response()->json([
                'success' => true,
                'reservationId' => $reservationId,
                'cancellationStatus' => 'cancelled',
            ])->header('Cache-Control', 'no-store, private');
        }
        if (! in_array($status, ['booked', 'contract'], true)) {
            return response()->json(['success' => false, 'code' => 'reservation_not_cancellable', 'message' => 'O status atual desta reserva não permite cancelamento por este fluxo.'], 409);
        }
        if (Schema::hasColumn('existing_reservation_payment_locks', 'guest_cancel_claimed_at') || app(ReservationCoordinationMode::class)->isRequired()) {
            $canonical = $details['_id'] ?? null;
            $code = $details['id'] ?? null;
            if (! is_string($canonical) || ! preg_match('/^[a-f0-9]{24}$/iD', $canonical)
                || ! is_string($code) || ! preg_match('/^[A-Z0-9]{5}$/D', $code)
                || ! in_array($reservationId, [$canonical, $code], true)) {
                return response()->json(['success' => false, 'code' => 'reservation_state_unavailable', 'message' => 'Não foi possível validar a identidade da reserva. Entre em contato com a Central.'], 503);
            }
            $identity = ['canonical' => strtolower($canonical), 'code' => $code];
            if (! app(StaysReservationIdentity::class)->remember($identity)
                || ! app(ExistingReservationPaymentLock::class)->synchronized($identity['canonical'],
                    fn (): bool => app(ReservationReleaseGuard::class)->claimGuestCancellation($identity))) {
                return response()->json(['success' => false, 'code' => 'direct_booking_cancellation_requires_support', 'message' => 'Entre em contato com a Central para analisar o cancelamento e os pagamentos desta reserva.'], 409);
            }
            // Keep the claim even if this read or the subsequent PATCH is uncertain.
            $current = $this->stays->get('/booking/reservations/'.rawurlencode($canonical));
            if (! is_array($current) || ($current['_id'] ?? null) !== $canonical || ($current['id'] ?? null) !== $code
                || ($current['_idclient'] ?? null) !== $clientId || ! in_array(strtolower((string) ($current['type'] ?? '')), ['booked', 'contract'], true)) {
                return response()->json(['success' => false, 'code' => 'reservation_state_unavailable', 'message' => 'Não foi possível confirmar a reserva após registrar a solicitação. Entre em contato com a Central.'], 503);
            }
        }
        $response = $this->stays->request('PATCH', '/booking/reservations/'.rawurlencode($reservationId), payload: ['type' => 'canceled', 'cancelMessage' => 'Cancelamento solicitado pelo hóspede pelo site Central de Reservas Caldas Novas.']);
        if (! $response?->successful()) {
            return response()->json(['success' => false, 'code' => 'stays_cancel_failed', 'message' => 'A Stays não confirmou o resultado do cancelamento. Entre em contato com a Central para conferir a reserva.'], 502);
        }

        return response()->json(['success' => true, 'reservationId' => $reservationId, 'cancellationStatus' => 'cancelled'])
            ->header('Cache-Control', 'no-store, private');
    }

    private function clientId(VerifiedGuest $guest): ?string
    {
        $profile = GuestProfile::query()->find($guest->id);
        if (! $profile?->stays_client_id) {
            return $this->guestSync->sync($guest);
        }

        return GuestProfile::query()->find($guest->id)?->stays_client_id;
    }

    private function mapReservation(array $record, array $catalog, VerifiedGuest $guest, ?DirectBookingOrder $directOrder = null): ?array
    {
        $id = (string) ($record['id'] ?? $record['_id'] ?? '');
        $checkIn = (string) ($record['checkInDate'] ?? '');
        $checkOut = (string) ($record['checkOutDate'] ?? '');
        if ($id === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkIn) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkOut)) {
            return null;
        }
        $type = strtolower((string) ($record['type'] ?? ''));
        $status = match (true) {
            in_array($type, ['cancelled', 'canceled'], true) => 'cancelled',
            in_array($type, ['booked', 'contract'], true) => 'confirmed',
            $type === 'reserved' => 'pending',
            default => null,
        };
        if ($status === null) {
            return null;
        }
        $isDirectCheckoutReservation = $directOrder !== null
            || str_starts_with((string) ($record['internalNote'] ?? ''), 'CRCN_DIRECT_ORDER:');
        $isDirectCheckoutConfirmed = $directOrder !== null
            && in_array($directOrder->status, [DirectBookingOrderStatus::Confirmado, DirectBookingOrderStatus::CancelamentoSolicitado], true)
            && $directOrder->payment_status === 'approved';
        if ($isDirectCheckoutReservation && ! $isDirectCheckoutConfirmed) {
            $status = 'pending';
        }
        $nights = max(1, (int) now()->parse($checkIn)->diffInDays(now()->parse($checkOut)));
        $propertyId = (string) ($record['_idlisting'] ?? '');
        $property = collect($catalog)->first(fn (array $item): bool => in_array($propertyId, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));
        $total = (float) ($record['price']['_f_total'] ?? $record['price']['hostingDetails']['_f_total'] ?? 0);

        return [
            'id' => $id,
            'code' => $id,
            'propertyId' => $propertyId,
            'propertyTitle' => $property['title'] ?? $record['_mslistingTitle']['pt_BR'] ?? 'Acomodação',
            'propertyLocation' => $property['subtitle'] ?? '',
            'propertyImage' => $property['images'][0] ?? $catalog[0]['images'][0] ?? '',
            'checkIn' => $checkIn,
            'checkOut' => $checkOut,
            'checkInTime' => is_string($record['checkInTime'] ?? null) ? trim($record['checkInTime']) : null,
            'checkOutTime' => is_string($record['checkOutTime'] ?? null) ? trim($record['checkOutTime']) : null,
            'nights' => $nights,
            'guests' => [
                'adults' => (int) ($record['guestsDetails']['adults'] ?? $record['guests'] ?? 1),
                'children' => (int) ($record['guestsDetails']['children'] ?? 0),
                'infants' => (int) ($record['guestsDetails']['infants'] ?? 0),
                'pets' => 0,
            ],
            'pricePerNight' => (float) ($record['price']['hostingDetails']['_f_nightPrice'] ?? $total / $nights),
            'cleaningFee' => 0,
            'serviceFee' => 0,
            'discount' => 0,
            'totalAmount' => $total,
            'paymentMethod' => '',
            'status' => $status === 'confirmed' && $checkOut < now()->toDateString() ? 'completed' : $status,
            'cancellationRequested' => $directOrder?->status === DirectBookingOrderStatus::CancelamentoSolicitado,
            'createdAt' => $record['creationDate'] ?? '',
            'hostName' => 'Central de Reservas Caldas Novas',
            'guestName' => $guest->fullName,
            'guestEmail' => $guest->email,
            'guestPhone' => '',
            'staysReservationId' => $id,
            'staysLocator' => $record['partnerCode'] ?? '',
            'directBookingReference' => $directOrder?->public_reference,
            'staysSyncStatus' => 'synced',
        ];
    }
}
