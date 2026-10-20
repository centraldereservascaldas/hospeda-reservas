<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOwnerCalendarBlockRequest;
use App\Models\OwnerAccess;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerDashboardController extends Controller
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    public function show(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $access = OwnerAccess::query()->find($guest->id);
        if (! $access || $access->status !== 'approved' || ! $access->stays_owner_id) {
            return response()->json(['success' => false, 'code' => 'owner_access_not_approved', 'message' => 'O acesso ao painel de proprietário ainda não foi aprovado.'], 403);
        }
        $input = $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d']]);
        $from = $input['from'] ?? now()->startOfMonth()->toDateString();
        $to = $input['to'] ?? now()->endOfMonth()->toDateString();
        if ($to < $from || now()->parse($from)->diffInDays(now()->parse($to)) > 366) {
            return response()->json(['success' => false, 'code' => 'invalid_date_range', 'message' => 'Selecione um período válido de até 12 meses.'], 400);
        }
        $ownerResponse = $this->stays->get('/finance/owners/'.rawurlencode($access->stays_owner_id), ['from' => $from, 'to' => $to]);
        if (! is_array($ownerResponse)) {
            return response()->json(['success' => false, 'code' => 'owner_finance_unavailable', 'message' => 'Não foi possível carregar os dados financeiros agora.'], 502);
        }
        $owner = $ownerResponse['owner'] ?? $ownerResponse['data'] ?? $ownerResponse;
        $ownerListings = $owner['listings'] ?? [];
        if (count($ownerListings) > 200) {
            return response()->json(['success' => false, 'code' => 'owner_listing_limit', 'message' => 'A lista de propriedades ultrapassa o limite de consulta. Fale com a Central.'], 502);
        }
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $properties = collect($ownerListings)->map(function (array $listing) use ($catalog): array {
            $id = (string) ($listing['id'] ?? $listing['code'] ?? $listing['_id'] ?? '');
            $property = collect($catalog)->first(fn (array $item): bool => in_array($id, [$item['id'] ?? '', $item['staysListingId'] ?? '', $item['staysListingObjectId'] ?? ''], true));

            return ['staysListingId' => $id, 'title' => $property['title'] ?? $listing['internalName'] ?? $listing['id'] ?? 'Acomodação', 'image' => $property['images'][0] ?? '', 'debit' => (float) ($listing['debit']['_mcval']['BRL'] ?? 0), 'credit' => (float) ($listing['credit']['_mcval']['BRL'] ?? 0)];
        })->filter(fn (array $item): bool => $item['staysListingId'] !== '')->values();
        $reservations = [];
        foreach ($properties as $property) {
            $recordsById = [];
            foreach (['reserved', 'booked', 'contract', 'blocked', 'maintenance'] as $reservationType) {
                for ($skip = 0; $skip <= 1000; $skip += 20) {
                    $typePage = $this->stays->get('/booking/reservations', ['from' => $from, 'to' => $to, 'dateType' => 'included', 'listingId' => $property['staysListingId'], 'type' => $reservationType, 'skip' => $skip, 'limit' => 20]);
                    if (! is_array($typePage)) {
                        return response()->json(['success' => false, 'code' => 'owner_reservations_unavailable', 'message' => 'Não foi possível carregar todas as reservas do período.'], 502);
                    }
                    foreach ($typePage as $record) {
                        $recordId = (string) ($record['_id'] ?? $record['id'] ?? '');
                        if ($recordId !== '') {
                            $recordsById[$recordId] = $record;
                        }
                    }
                    if (count($typePage) < 20) {
                        break;
                    }
                    if ($skip === 1000) {
                        return response()->json(['success' => false, 'code' => 'owner_reservations_limit', 'message' => 'Há muitas reservas no período para exibir com segurança. Reduza o intervalo.'], 502);
                    }
                }
            }
            foreach ($recordsById as $recordId => $record) {
                $checkIn = (string) ($record['checkInDate'] ?? '');
                $checkOut = (string) ($record['checkOutDate'] ?? '');
                if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkIn) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkOut)) {
                    continue;
                }
                $type = strtolower((string) ($record['type'] ?? ''));
                $status = in_array($type, ['canceled', 'cancelled'], true) ? 'cancelled' : (in_array($type, ['reserved', 'booked', 'contract'], true) ? 'confirmed' : (in_array($type, ['blocked', 'maintenance'], true) ? 'blocked' : 'other'));
                $total = (float) ($record['price']['_f_total'] ?? $record['price']['hostingDetails']['_f_total'] ?? 0);
                $paidAmount = is_numeric($record['stats']['_f_totalPaid'] ?? null) ? (float) $record['stats']['_f_totalPaid'] : null;
                $paymentStatus = $paidAmount === null ? 'unknown' : ($paidAmount <= 0 ? 'unpaid' : ($total > 0 && $paidAmount + 0.01 < $total ? 'partial' : 'paid'));
                $reservations[] = ['id' => $recordId, 'code' => $record['partnerCode'] ?? $record['code'] ?? $recordId, 'listingId' => $property['staysListingId'], 'propertyTitle' => $property['title'], 'propertyImage' => $property['image'], 'guestName' => mb_substr((string) ($record['client']['name'] ?? trim(($record['client']['fName'] ?? '').' '.($record['client']['lName'] ?? '')) ?: ($record['guestName'] ?? 'Hóspede')), 0, 120), 'checkIn' => $checkIn, 'checkOut' => $checkOut, 'status' => $status, 'paymentStatus' => $paymentStatus, 'total' => $total, 'currency' => $record['price']['currency'] ?? 'BRL', 'nights' => max(1, (int) now()->parse($checkIn)->diffInDays(now()->parse($checkOut)))];
            }
        }
        usort($reservations, fn (array $a, array $b): int => $a['checkIn'] <=> $b['checkIn']);

        return response()->json(['success' => true, 'period' => ['from' => $from, 'to' => $to], 'ownerName' => (string) ($owner['name'] ?? ''), 'totals' => ['debit' => (float) ($owner['debit']['_mcval']['BRL'] ?? 0), 'credit' => (float) ($owner['credit']['_mcval']['BRL'] ?? 0)], 'properties' => $properties, 'reservations' => $reservations]);
    }

    public function storeBlock(StoreOwnerCalendarBlockRequest $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session', 'message' => 'Sua sessão expirou. Entre novamente.'], 401);
        }
        $access = OwnerAccess::query()->find($guest->id);
        if (! $access || $access->status !== 'approved' || ! $access->stays_owner_id) {
            return response()->json(['success' => false, 'code' => 'owner_access_not_approved', 'message' => 'O acesso ao painel de proprietário ainda não foi aprovado.'], 403);
        }

        $input = $request->validated();
        $ownerResponse = $this->stays->get('/finance/owners/'.rawurlencode($access->stays_owner_id), ['from' => $input['from'], 'to' => $input['to']]);
        if (! is_array($ownerResponse)) {
            return response()->json(['success' => false, 'code' => 'owner_properties_unavailable', 'message' => 'Não foi possível confirmar a propriedade na Stays. Tente novamente.'], 502);
        }
        $owner = $ownerResponse['owner'] ?? $ownerResponse['data'] ?? $ownerResponse;
        $listings = $owner['listings'] ?? [];
        $listing = collect($listings)->first(fn (array $item): bool => in_array($input['listingId'], [(string) ($item['id'] ?? ''), (string) ($item['_id'] ?? ''), (string) ($item['code'] ?? '')], true));
        if (! $listing) {
            return response()->json(['success' => false, 'code' => 'owner_listing_forbidden', 'message' => 'Essa propriedade não está vinculada ao seu acesso de proprietário.'], 403);
        }

        foreach (['reserved', 'booked', 'contract', 'blocked', 'maintenance'] as $reservationType) {
            for ($skip = 0; $skip <= 1000; $skip += 20) {
                $page = $this->stays->get('/booking/reservations', ['from' => $input['from'], 'to' => $input['to'], 'dateType' => 'included', 'listingId' => $input['listingId'], 'type' => $reservationType, 'skip' => $skip, 'limit' => 20]);
                if (! is_array($page)) {
                    return response()->json(['success' => false, 'code' => 'owner_reservations_unavailable', 'message' => 'Não foi possível verificar a disponibilidade. Nenhum bloqueio foi criado.'], 502);
                }
                foreach ($page as $reservation) {
                    $existingFrom = (string) ($reservation['checkInDate'] ?? '');
                    $existingTo = (string) ($reservation['checkOutDate'] ?? '');
                    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $existingFrom) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $existingTo) && $input['from'] < $existingTo && $input['to'] > $existingFrom) {
                        return response()->json(['success' => false, 'code' => 'calendar_block_conflict', 'message' => 'Esse período coincide com uma reserva ou bloqueio existente. Atualize o calendário e escolha outras datas.'], 409);
                    }
                }
                if (count($page) < 20) {
                    break;
                }
                if ($skip === 1000) {
                    return response()->json(['success' => false, 'code' => 'owner_reservations_limit', 'message' => 'Não foi possível verificar todo o período com segurança.'], 502);
                }
            }
        }

        $created = $this->stays->post('/booking/reservations', ['type' => 'blocked', 'listingId' => $input['listingId'], 'checkInDate' => $input['from'], 'checkOutDate' => $input['to'], ...(! empty($input['reason']) ? ['internalNote' => $input['reason']] : [])]);
        if (! is_array($created) || strtolower((string) ($created['type'] ?? 'blocked')) !== 'blocked') {
            return response()->json(['success' => false, 'code' => 'calendar_block_failed', 'message' => 'A Stays não confirmou o bloqueio. Atualize o calendário antes de tentar novamente.'], 502);
        }

        return response()->json(['success' => true, 'status' => 'blocked', 'blockId' => (string) ($created['_id'] ?? $created['id'] ?? '')], 201);
    }
}
