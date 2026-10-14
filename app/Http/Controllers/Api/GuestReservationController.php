<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\DirectBookingOrder;
use App\Models\GuestProfile;
use App\Services\GuestStaysSyncService;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $data = collect(is_array($records) ? $records : [])->map(fn (array $record): ?array => $this->mapReservation($record, $catalog))->filter()->values();

        return response()->json(['success' => true, 'data' => $data]);
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
        $isDirectCheckoutReservation = str_starts_with((string) ($details['internalNote'] ?? ''), 'CRCN_DIRECT_ORDER:')
            || DirectBookingOrder::query()->whereIn('stays_reservation_id', $reservationIds)->exists();
        if ($isDirectCheckoutReservation) {
            return response()->json(['success' => false, 'code' => 'direct_booking_cancellation_requires_support', 'message' => 'O cancelamento desta compra precisa ser acompanhado pela Central para conferir a reserva e o pagamento. Entre em contato com o atendimento.'], 409);
        }

        $detailClientId = (string) ($details['_idclient'] ?? '');
        if ($detailClientId !== '' && ! hash_equals($clientId, $detailClientId)) {
            return response()->json(['success' => false, 'code' => 'reservation_not_found', 'message' => 'Esta reserva não foi encontrada na sua conta.'], 404);
        }

        $status = strtolower((string) ($details['type'] ?? ''));
        if (in_array($status, ['canceled', 'cancelled'], true)) {
            return response()->json(['success' => false, 'code' => 'already_cancelled', 'message' => 'Esta reserva já está cancelada.'], 409);
        }
        if (! in_array($status, ['booked', 'contract'], true)) {
            return response()->json(['success' => false, 'code' => 'reservation_not_cancellable', 'message' => 'O status atual desta reserva não permite cancelamento por este fluxo.'], 409);
        }
        $response = $this->stays->request('PATCH', '/booking/reservations/'.rawurlencode($reservationId), payload: ['type' => 'canceled', 'cancelMessage' => 'Cancelamento solicitado pelo hóspede pelo site Central de Reservas Caldas Novas.']);
        if (! $response?->successful()) {
            return response()->json(['success' => false, 'code' => 'stays_cancel_failed', 'message' => 'A Stays não confirmou o cancelamento. A reserva continua ativa; entre em contato com a Central.'], 502);
        }

        return response()->json(['success' => true, 'reservationId' => $reservationId]);
    }

    private function clientId(VerifiedGuest $guest): ?string
    {
        $profile = GuestProfile::query()->find($guest->id);
        if (! $profile?->stays_client_id) {
            return $this->guestSync->sync($guest);
        }

        return GuestProfile::query()->find($guest->id)?->stays_client_id;
    }

    private function mapReservation(array $record, array $catalog): ?array
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
        $nights = max(1, (int) now()->parse($checkIn)->diffInDays(now()->parse($checkOut)));
        $propertyId = (string) ($record['_idlisting'] ?? '');
        $property = collect($catalog)->first(fn (array $item): bool => in_array($propertyId, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));
        $total = (float) ($record['price']['_f_total'] ?? $record['price']['hostingDetails']['_f_total'] ?? 0);

        return ['id' => $id, 'code' => $id, 'propertyId' => $propertyId, 'propertyTitle' => $property['title'] ?? $record['_mslistingTitle']['pt_BR'] ?? 'Acomodação', 'propertyLocation' => $property['subtitle'] ?? '', 'propertyImage' => $property['images'][0] ?? $catalog[0]['images'][0] ?? '', 'checkIn' => $checkIn, 'checkOut' => $checkOut, 'nights' => $nights, 'guests' => ['adults' => (int) ($record['guestsDetails']['adults'] ?? $record['guests'] ?? 1), 'children' => (int) ($record['guestsDetails']['children'] ?? 0), 'infants' => (int) ($record['guestsDetails']['infants'] ?? 0), 'pets' => 0], 'pricePerNight' => (float) ($record['price']['hostingDetails']['_f_nightPrice'] ?? $total / $nights), 'cleaningFee' => 0, 'serviceFee' => 0, 'discount' => 0, 'totalAmount' => $total, 'paymentMethod' => '', 'status' => $status === 'confirmed' && $checkOut < now()->toDateString() ? 'completed' : $status, 'createdAt' => $record['creationDate'] ?? '', 'hostName' => 'Central de Reservas Caldas Novas', 'guestName' => $record['bookerDetails']['name'] ?? '', 'guestEmail' => $record['bookerDetails']['email'] ?? '', 'guestPhone' => '', 'staysReservationId' => $id, 'staysLocator' => $record['partnerCode'] ?? '', 'staysSyncStatus' => 'synced'];
    }
}
