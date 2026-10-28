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

    /**
     * @param  array{owner: array<string, mixed>|null, reason: 'owner_not_found'|'unavailable'|null}  $finance
     */
    private function ownerFinanceFailure(array $finance, string $fallbackCode, string $fallbackMessage): JsonResponse
    {
        if ($finance['reason'] === 'owner_not_found') {
            return response()->json([
                'success' => false,
                'code' => 'stays_owner_link_not_found',
                'message' => 'O vínculo deste proprietário não foi localizado na Stays. A Central precisa revisar o cadastro antes de exibir os dados.',
            ], 409);
        }

        return response()->json(['success' => false, 'code' => $fallbackCode, 'message' => $fallbackMessage], 502);
    }

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
        $finance = $this->stays->ownerFinance($access->stays_owner_id, $from, $to);
        if (! is_array($finance['owner'])) {
            return $this->ownerFinanceFailure($finance, 'owner_finance_unavailable', 'Não foi possível carregar os dados financeiros agora.');
        }
        $owner = $finance['owner'];
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
        $reservationByReference = [];
        foreach ($properties as $property) {
            $recordsById = [];
            foreach (['reserved', 'booked', 'contract', 'blocked', 'maintenance', 'canceled'] as $reservationType) {
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
                $reservationData = ['id' => $recordId, 'code' => $record['id'] ?? $record['partnerCode'] ?? $record['code'] ?? $recordId, 'listingId' => $property['staysListingId'], 'propertyTitle' => $property['title'], 'propertyImage' => $property['image'], 'guestName' => mb_substr((string) ($record['client']['name'] ?? trim(($record['client']['fName'] ?? '').' '.($record['client']['lName'] ?? '')) ?: ($record['guestName'] ?? 'Hóspede')), 0, 120), 'checkIn' => $checkIn, 'checkOut' => $checkOut, 'status' => $status, 'paymentStatus' => $paymentStatus, 'total' => $total, 'currency' => $record['price']['currency'] ?? 'BRL', 'nights' => max(1, (int) now()->parse($checkIn)->diffInDays(now()->parse($checkOut)))];
                $reservations[] = $reservationData;
                foreach ([$recordId, $record['id'] ?? null, $record['partnerCode'] ?? null, $record['code'] ?? null] as $reference) {
                    if (is_string($reference) && $reference !== '') {
                        $reservationByReference[$reference] = $reservationData;
                    }
                }
            }
        }
        usort($reservations, fn (array $a, array $b): int => $a['checkIn'] <=> $b['checkIn']);

        $propertyById = $properties->keyBy('staysListingId');
        $entries = [];
        foreach ($ownerListings as $listing) {
            $listingId = (string) ($listing['id'] ?? $listing['code'] ?? $listing['_id'] ?? '');
            $property = $propertyById->get($listingId);
            foreach (($listing['accounts'] ?? []) as $index => $account) {
                if (! is_array($account)) {
                    continue;
                }
                $date = (string) ($account['date'] ?? '');
                $type = strtolower((string) ($account['type'] ?? ''));
                $amount = $account['_mcval']['BRL'] ?? null;
                if (! preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $date) || ! in_array($type, ['debit', 'credit'], true) || ! is_numeric($amount)) {
                    continue;
                }
                $reservationId = isset($account['reserveId']) ? (string) $account['reserveId'] : null;
                $reservation = $reservationId !== null ? ($reservationByReference[$reservationId] ?? null) : null;
                $description = trim((string) ($account['transactionName'] ?? ''));
                if ($description === '' && $reservation) {
                    $description = date('d/m/Y', strtotime($reservation['checkIn'])).' - '.date('d/m/Y', strtotime($reservation['checkOut']));
                }
                if ($description === '') {
                    $description = trim((string) ($account['publicNote'] ?? '')) ?: 'Lançamento financeiro';
                }
                $publicNote = trim((string) ($account['publicNote'] ?? ''));
                $entries[] = [
                    'id' => (string) ($account['_id'] ?? $listingId.'-'.$date.'-'.$type.'-'.$index),
                    'date' => $date,
                    'listingId' => $listingId,
                    'propertyTitle' => $property['title'] ?? (string) ($listing['internalName'] ?? 'Acomodação'),
                    'reservationId' => $reservationId,
                    'reservationCode' => $reservation['code'] ?? null,
                    'description' => $description,
                    'publicNote' => $publicNote !== '' ? $publicNote : null,
                    'type' => $type,
                    'status' => (string) ($account['status'] ?? ''),
                    'amount' => (float) $amount,
                ];
            }
        }
        usort($entries, fn (array $a, array $b): int => $b['date'] <=> $a['date']);

        return response()->json(['success' => true, 'period' => ['from' => $from, 'to' => $to], 'ownerName' => (string) ($owner['name'] ?? ''), 'totals' => ['debit' => (float) ($owner['debit']['_mcval']['BRL'] ?? 0), 'credit' => (float) ($owner['credit']['_mcval']['BRL'] ?? 0)], 'properties' => $properties, 'reservations' => $reservations, 'entries' => $entries]);
    }

    public function accountingEntryDetails(Request $request, string $entryId): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $access = OwnerAccess::query()->find($guest->id);
        if (! $access || $access->status !== 'approved' || ! $access->stays_owner_id) {
            return response()->json(['success' => false, 'code' => 'owner_access_not_approved'], 403);
        }
        $input = $request->validate([
            'listingId' => ['required', 'string', 'max:160'],
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        if (now()->parse($input['from'])->diffInDays(now()->parse($input['to'])) > 366) {
            return response()->json(['success' => false, 'code' => 'invalid_date_range'], 400);
        }
        $finance = $this->stays->ownerFinance($access->stays_owner_id, $input['from'], $input['to']);
        if (! is_array($finance['owner'])) {
            return $this->ownerFinanceFailure($finance, 'owner_finance_unavailable', 'Não foi possível validar o lançamento na Stays.');
        }
        $owner = $finance['owner'];
        $listing = collect($owner['listings'] ?? [])->first(fn (array $item): bool => in_array($input['listingId'], [(string) ($item['id'] ?? ''), (string) ($item['_id'] ?? ''), (string) ($item['code'] ?? '')], true));
        if (! $listing) {
            return response()->json(['success' => false, 'code' => 'owner_listing_forbidden'], 403);
        }
        $account = collect($listing['accounts'] ?? [])->values()->first(function (array $item, int $index) use ($entryId, $input): bool {
            $date = (string) ($item['date'] ?? '');
            $type = strtolower((string) ($item['type'] ?? ''));
            $id = (string) ($item['_id'] ?? $input['listingId'].'-'.$date.'-'.$type.'-'.$index);

            return $id === $entryId
                && $date >= $input['from']
                && $date <= $input['to']
                && in_array($type, ['debit', 'credit'], true);
        });
        if (! $account) {
            return response()->json(['success' => false, 'code' => 'accounting_entry_not_found'], 404);
        }
        $reservationId = (string) ($account['reserveId'] ?? '');
        $reservation = $reservationId !== '' ? $this->stays->get('/booking/reservations/'.rawurlencode($reservationId)) : null;
        $reservationListingIds = is_array($reservation) ? array_map('strval', array_filter([$reservation['listingId'] ?? null, $reservation['_idlisting'] ?? null, $reservation['apartment']['_id'] ?? null], 'is_scalar')) : [];
        $ownerListingIds = [(string) ($listing['id'] ?? ''), (string) ($listing['_id'] ?? ''), (string) ($listing['code'] ?? ''), $input['listingId']];
        if ($reservationId !== '' && (! is_array($reservation) || array_intersect($reservationListingIds, $ownerListingIds) === [])) {
            return response()->json(['success' => false, 'code' => 'reservation_details_unavailable', 'message' => 'Os detalhes da reserva não estão disponíveis na Stays.'], 502);
        }
        $amount = static fn (mixed $value): float => is_numeric($value) ? (float) $value : (float) ($value['_mcval']['BRL'] ?? $value['_f_val'] ?? 0);
        $fees = [];
        $accountAmount = $amount($account['_mcval']['BRL'] ?? 0);
        $checkIn = (string) ($reservation['checkInDate'] ?? '');
        $checkOut = (string) ($reservation['checkOutDate'] ?? '');
        if (strtolower((string) ($account['type'] ?? '')) === 'credit'
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkIn)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkOut)) {
            $exportReservations = $this->stays->post('/booking/reservations-export', [
                'from' => $checkIn,
                'to' => $checkOut,
                'dateType' => 'included',
                'listingId' => [(string) ($listing['id'] ?? $listing['code'] ?? $input['listingId'])],
            ]);
            $reservationReferences = array_values(array_filter([
                $reservationId,
                $reservation['id'] ?? null,
                $reservation['partnerCode'] ?? null,
                $reservation['code'] ?? null,
            ], 'is_scalar'));
            $exportReservation = collect(is_array($exportReservations) && array_is_list($exportReservations) ? $exportReservations : [])
                ->first(function (mixed $item) use ($reservationReferences, $ownerListingIds): bool {
                    if (! is_array($item)) {
                        return false;
                    }
                    $exportReferences = array_map('strval', array_filter([
                        $item['_id'] ?? null,
                        $item['id'] ?? null,
                        $item['partnerCode'] ?? null,
                    ], 'is_scalar'));
                    $exportListingIds = array_map('strval', array_filter([
                        $item['listing']['id'] ?? null,
                        $item['_idlisting'] ?? null,
                    ], 'is_scalar'));

                    return array_intersect(array_map('strval', $reservationReferences), $exportReferences) !== []
                        && array_intersect($ownerListingIds, $exportListingIds) !== [];
                });

            if (is_array($exportReservation)) {
                foreach (is_array($exportReservation['ownerFee'] ?? null) ? $exportReservation['ownerFee'] : [] as $ownerFee) {
                    $label = trim((string) ($ownerFee['desc'] ?? ''));
                    $feeAmount = $ownerFee['val'] ?? null;
                    if ($label !== '' && is_numeric($feeAmount) && (float) $feeAmount > 0) {
                        $fees[] = ['label' => $label, 'amount' => (float) $feeAmount];
                    }
                }

                $companyCommission = $exportReservation['companyCommision'] ?? null;
                if (is_numeric($companyCommission) && (float) $companyCommission > 0) {
                    $fees[] = ['label' => 'Comissão do administrador', 'amount' => (float) $companyCommission];
                }
            }
        }

        return response()->json(['success' => true, 'details' => [
            'reservationCode' => (string) ($reservation['id'] ?? $reservation['partnerCode'] ?? $reservation['code'] ?? ($reservationId !== '' ? $reservationId : '')),
            'guestName' => (string) ($reservation['client']['name'] ?? trim(($reservation['client']['fName'] ?? '').' '.($reservation['client']['lName'] ?? '')) ?: 'Hóspede'),
            'checkIn' => (string) ($reservation['checkInDate'] ?? ''),
            'checkOut' => (string) ($reservation['checkOutDate'] ?? ''),
            'nights' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($reservation['checkInDate'] ?? '')) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($reservation['checkOutDate'] ?? '')) ? max(0, (int) now()->parse($reservation['checkInDate'])->diffInDays(now()->parse($reservation['checkOutDate']))) : 0,
            'fees' => $fees,
            'payout' => $amount($account['_mcval']['BRL'] ?? 0),
            'ledgerEntry' => [
                'date' => (string) ($account['date'] ?? ''),
                'type' => strtolower((string) ($account['type'] ?? 'credit')),
                'status' => (string) ($account['status'] ?? ''),
                'description' => (string) ($account['transactionName'] ?? $account['publicNote'] ?? $account['internalName'] ?? 'Lançamento financeiro'),
                'amount' => $accountAmount,
            ],
        ]]);
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
        $finance = $this->stays->ownerFinance($access->stays_owner_id, $input['from'], $input['to']);
        if (! is_array($finance['owner'])) {
            return $this->ownerFinanceFailure($finance, 'owner_properties_unavailable', 'Não foi possível confirmar a propriedade na Stays. Tente novamente.');
        }
        $owner = $finance['owner'];
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
