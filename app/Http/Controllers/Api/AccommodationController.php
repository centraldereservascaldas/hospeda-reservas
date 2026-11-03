<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SearchAccommodationsRequest;
use App\Http\Resources\AccommodationSearchResource;
use App\Services\StaysAccommodationMapper;
use App\Services\StaysCalendarService;
use App\Services\StaysExternalApiClient;
use App\Services\StaysSearchAvailabilityService;
use App\Services\StaysSimulator;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

class AccommodationController extends Controller
{
    private const LIVE_CATALOG_CACHE_KEY = 'stays.live-accommodation-catalog.v1';

    private const LIVE_CATALOG_CACHE_TTL_SECONDS = 300;

    private const LIVE_CATALOG_LOCK_LEASE_SECONDS = 2100;

    private const LIVE_CATALOG_LOCK_WAIT_SECONDS = 15;

    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysAccommodationMapper $mapper) {}

    public function resorts(): JsonResponse
    {
        $properties = $this->stays->get('/content/properties', ['status' => 'active', 'limit' => 100, 'skip' => 0]);
        if ($properties === null) {
            return response()->json(['success' => false, 'source' => 'unavailable', 'data' => []], 503);
        }

        $resorts = collect($properties)->map(fn (array $item): array => [
            'id' => (string) ($item['_id'] ?? $item['id'] ?? ''),
            'name' => $this->mapper->localized($item['_mstitle'] ?? null) ?: ($item['internalName'] ?? ''),
        ])->filter(fn (array $item): bool => $item['id'] !== '' && trim($item['name']) !== '')
            ->unique('id')->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values();

        return response()->json(['success' => true, 'source' => 'stays-live', 'total' => $resorts->count(), 'data' => $resorts]);
    }

    public function index(StaysSimulator $simulator): JsonResponse
    {
        if ($simulator->enabled()) {
            $listings = $simulator->catalog();

            return response()->json(['success' => true, 'source' => 'stays-simulated', 'count' => count($listings), 'data' => $listings]);
        }

        $fallback = $this->catalog();
        if (! $this->stays->isConfigured()) {
            if (app()->isProduction()) {
                return response()->json(['success' => false, 'source' => 'unavailable', 'count' => 0, 'data' => []], 503);
            }

            return response()->json(['success' => true, 'source' => 'local-catalog', 'count' => count($fallback), 'data' => $fallback]);
        }

        try {
            $catalog = Cache::get(self::LIVE_CATALOG_CACHE_KEY);
            if (! is_array($catalog)) {
                $catalog = Cache::lock(self::LIVE_CATALOG_CACHE_KEY.':lock', self::LIVE_CATALOG_LOCK_LEASE_SECONDS)
                    ->block(self::LIVE_CATALOG_LOCK_WAIT_SECONDS, fn (): array => Cache::remember(self::LIVE_CATALOG_CACHE_KEY, self::LIVE_CATALOG_CACHE_TTL_SECONDS, function () use ($fallback): array {
                        $listings = $this->stays->activeListings();
                        if ($listings === null) {
                            throw new RuntimeException('Stays returned an unavailable accommodation catalog.');
                        }

                        $mapped = array_map(fn (array $listing): array => $this->mapper->map($listing, $fallback), $listings);

                        return ['success' => true, 'source' => 'stays-live', 'count' => count($mapped), 'data' => $mapped];
                    }));
            }
        } catch (RuntimeException|LockTimeoutException) {
            return response()->json([
                'success' => false,
                'source' => 'unavailable',
                'message' => 'Não foi possível atualizar as acomodações na Stays agora.',
                'count' => 0,
                'data' => [],
            ], 503);
        }

        return response()->json($catalog);
    }

    public function show(string $id, StaysSimulator $simulator): JsonResponse
    {
        if ($simulator->enabled()) {
            $property = $simulator->find($id);

            return $property
                ? response()->json(['success' => true, 'data' => $property, 'source' => 'stays-simulated'])
                : response()->json(['success' => false, 'message' => 'Acomodação não encontrada na base simulada.'], 404);
        }

        $fallback = $this->catalog();
        $existing = collect($fallback)->first(fn (array $item): bool => ($item['id'] ?? null) === $id || ($item['staysListingId'] ?? null) === $id);
        $detailResponse = $this->stays->request('GET', '/content/listings/'.rawurlencode($id));
        $detail = $detailResponse?->successful() ? $detailResponse->json() : null;
        $detailId = is_array($detail) && ! array_is_list($detail)
            ? ($detail['id'] ?? $detail['code'] ?? $detail['_id'] ?? null)
            : null;
        $hasValidDetail = is_string($detailId) && trim($detailId) !== '';
        if ($detailResponse?->status() === 404 && app()->isProduction()) {
            return response()->json(['success' => false, 'message' => 'Acomodação não encontrada na base Stays.'], 404);
        }
        if ($hasValidDetail) {
            $existing = $this->mapper->map($detail, $fallback);
        } elseif (app()->isProduction()) {
            return response()->json(['success' => false, 'message' => 'Acomodação indisponível na Stays.'], 503);
        }
        if ($existing === null) {
            return response()->json(['success' => false, 'message' => 'Acomodação não encontrada na base Stays.'], 404);
        }

        $rooms = $this->stays->get('/content/listing-rooms/'.rawurlencode((string) ($existing['staysListingId'] ?? $id)));
        if (is_array($rooms)) {
            $existing['sleepingArrangements'] = array_map(fn (array $room, int $index): array => [
                'roomName' => $room['name'] ?? 'Quarto '.($index + 1),
                'bedType' => collect($room['beds'] ?? [])->map(fn (array $bed): string => ($bed['count'] ?? 1).' '.($bed['type'] ?? 'cama'))->implode(', ') ?: '1 cama de casal',
                'icon' => 'BedDouble',
            ], $rooms, array_keys($rooms));
        }

        return response()->json(['success' => true, 'data' => $existing]);
    }

    public function search(SearchAccommodationsRequest $request, StaysSimulator $simulator, StaysSearchAvailabilityService $availabilityService): JsonResponse
    {
        $input = $request->validated();
        $from = $input['from'] ?? null;
        $to = $input['to'] ?? null;
        $guests = (int) ($input['guests'] ?? 1);
        $limit = (int) ($input['limit'] ?? 20);
        $skip = (int) ($input['skip'] ?? 0);
        if ($from && $to && $to <= $from) {
            return response()->json(['success' => false, 'code' => 'invalid_search_dates', 'message' => 'Informe um período válido.'], 422);
        }
        if ($simulator->enabled()) {
            $matches = collect($simulator->catalog())->filter(function (array $property) use ($input, $guests): bool {
                if (($property['maxGuests'] ?? 0) < $guests) {
                    return false;
                }
                if (isset($input['propertyId']) && ($property['staysPropertyId'] ?? null) !== $input['propertyId']) {
                    return false;
                }
                if (! empty($input['destination'])) {
                    $haystack = mb_strtolower(implode(' ', [$property['title'] ?? '', $property['subtitle'] ?? '', $property['description'] ?? '', $property['category'] ?? '', $property['complexName'] ?? '']));
                    if (! str_contains($haystack, mb_strtolower($input['destination']))) {
                        return false;
                    }
                }
                if (! empty($input['cities'])) {
                    return in_array($property['location']['city'] ?? '', $input['cities'], true);
                }

                return true;
            })->values();
            $data = $matches->all();
            if ($from && $to) {
                $data = collect($data)->map(function (array $property) use ($simulator, $from, $to, $guests): ?array {
                    $result = $simulator->quote((string) ($property['staysListingId'] ?? $property['id']), $from, $to, $guests);

                    return ($result['available'] ?? false) ? $result['property'] : null;
                })->filter()->values()->all();
            }
            $total = count($data);
            $data = array_slice($data, $skip, $limit);

            return response()->json(['success' => true, 'total' => $total, 'from' => $from, 'to' => $to, 'guests' => $guests, 'data' => $data, 'source' => 'stays-simulated']);
        }
        if ($from && $to) {
            $resolved = $availabilityService->search($input);
            if ($resolved === null) {
                return response()->json(['success' => false, 'code' => 'availability_unavailable', 'message' => 'Não foi possível confirmar a disponibilidade agora. Tente novamente.'], 503);
            }

            $catalog = $this->catalog();
            $mapped = array_map(function (array $listing) use ($catalog): array {
                $property = $this->mapper->map($listing, $catalog);
                $property['calculatedPrice'] = $listing['calculatedPrice'];
                $property['pricePerNight'] = $listing['calculatedPrice']['dailyRate'];

                return $property;
            }, $resolved['items']);

            return (new AccommodationSearchResource([
                'data' => $mapped,
                'from' => $from,
                'to' => $to,
                'guests' => $guests,
                'meta' => $resolved['meta'],
                'unquotedCount' => $resolved['unquotedCount'],
                'pagination' => [
                    'receivedCount' => $resolved['receivedCount'],
                    'nextSkip' => $skip + $resolved['receivedCount'],
                    'hasMore' => $resolved['receivedCount'] === $limit,
                ],
            ]))->response();
        }

        if (app()->isProduction()) {
            $catalogResponse = $this->index($simulator);
            if ($catalogResponse->getStatusCode() !== 200) {
                return response()->json(['success' => false, 'source' => 'unavailable', 'data' => []], 503);
            }

            $catalog = $catalogResponse->getData(true)['data'] ?? [];
            $results = collect($catalog)->filter(function (array $item) use ($input, $guests): bool {
                if (($item['maxGuests'] ?? 0) < $guests || (isset($input['propertyId']) && ($item['staysPropertyId'] ?? null) !== $input['propertyId'])) {
                    return false;
                }
                if (! empty($input['destination'])) {
                    $haystack = mb_strtolower(implode(' ', [$item['title'] ?? '', $item['subtitle'] ?? '', $item['description'] ?? '', $item['category'] ?? '', $item['complexName'] ?? '']));
                    if (! str_contains($haystack, mb_strtolower($input['destination']))) {
                        return false;
                    }
                }
                if (! empty($input['cities']) && ! in_array($item['location']['city'] ?? '', $input['cities'], true)) {
                    return false;
                }

                return true;
            })->values();

            return response()->json(['success' => true, 'total' => $results->count(), 'from' => null, 'to' => null, 'guests' => $guests, 'data' => $results->slice($skip, $limit)->values(), 'source' => 'stays-live']);
        }

        $results = collect($this->catalog())->filter(function (array $item) use ($input, $guests): bool {
            if (($item['maxGuests'] ?? 0) < $guests || (isset($input['propertyId']) && ($item['staysPropertyId'] ?? null) !== $input['propertyId'])) {
                return false;
            }
            if (! empty($input['destination'])) {
                $haystack = mb_strtolower(implode(' ', [$item['title'] ?? '', $item['subtitle'] ?? '', $item['description'] ?? '', $item['category'] ?? '', $item['complexName'] ?? '']));
                if (! str_contains($haystack, mb_strtolower($input['destination']))) {
                    return false;
                }
            }

            return true;
        })->values();
        $nights = 1;
        if (isset($from, $to)) {
            $nights = max(1, now()->parse($from)->diffInDays(now()->parse($to)));
        }
        $data = $results->slice($skip, $limit)->map(function (array $item) use ($nights): array {
            $subtotal = ($item['pricePerNight'] ?? 0) * $nights;
            $cleaning = $item['cleaningFee'] ?? 0;
            $service = (int) round($subtotal * ($item['serviceFeeRate'] ?? 0));
            $item['calculatedPrice'] = ['nights' => $nights, 'dailyRate' => $item['pricePerNight'] ?? 0, 'basePrice' => $subtotal, 'cleaningFee' => $cleaning, 'serviceFee' => $service, 'totalAmount' => $subtotal + $cleaning + $service, 'currency' => 'BRL'];

            return $item;
        })->values();

        return response()->json(['success' => true, 'total' => $results->count(), 'from' => null, 'to' => null, 'guests' => $guests, 'data' => $data]);
    }

    public function calendar(Request $request, string $id, StaysSimulator $simulator, StaysCalendarService $calendarService): JsonResponse
    {
        $input = $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d']]);
        $from = $input['from'] ?? now()->toDateString();
        $to = $input['to'] ?? now()->addDays(89)->toDateString();
        if ($to <= $from) {
            return response()->json(['success' => false, 'code' => 'invalid_calendar_range', 'message' => 'Período do calendário inválido.'], 400);
        }
        if ($simulator->enabled()) {
            $property = $simulator->find($id);
            if ($property === null) {
                return response()->json(['success' => false, 'message' => 'Acomodação não encontrada na base simulada.'], 404);
            }
            $listingId = (string) ($property['id'] ?? $id);

            return response()->json([
                'success' => true,
                'listingId' => $property['id'],
                'staysListingId' => $property['staysListingId'] ?? null,
                'currency' => 'BRL',
                'data' => $simulator->calendar($listingId, $from, $to),
                'source' => 'stays-simulated',
            ]);
        }
        $property = collect($this->catalog())->first(fn (array $item): bool => ($item['id'] ?? null) === $id || ($item['staysListingId'] ?? null) === $id);
        if ($property === null) {
            $detail = $this->stays->get('/content/listings/'.rawurlencode($id));
            $property = $detail ? $this->mapper->map($detail, $this->catalog()) : null;
        }
        if ($property === null) {
            return response()->json(['success' => false, 'message' => 'Acomodação não encontrada.'], 404);
        }
        $calendar = $calendarService->get((string) ($property['staysListingId'] ?? $id), $from, $to);
        if (! is_array($calendar)) {
            return response()->json(['success' => false, 'code' => 'calendar_unavailable', 'message' => 'Não foi possível carregar a disponibilidade atualizada.'], 503);
        }

        return response()->json(['success' => true, 'listingId' => $property['id'], 'staysListingId' => $property['staysListingId'] ?? null, 'currency' => 'BRL', 'data' => $calendar['data'], 'meta' => $calendar['meta'], 'source' => 'stays-live'])->header('Cache-Control', 'no-store');
    }

    public function staysListings(): JsonResponse
    {
        $catalog = $this->catalog();
        $live = $this->stays->get('/content/listings', ['limit' => 50, 'skip' => 0, 'status' => 'active']);
        if (is_array($live) && $live !== []) {
            return response()->json(array_map(fn (array $item): array => $this->listingPayload($this->mapper->map($item, $catalog)), $live));
        }

        if (app()->isProduction()) {
            return is_array($live) ? response()->json([]) : response()->json(['error' => 'Catálogo Stays indisponível'], 503);
        }

        return response()->json(array_map(fn (array $item): array => $this->listingPayload($item), $catalog));
    }

    public function staysListing(string $id): JsonResponse
    {
        $catalog = $this->catalog();
        $item = collect($catalog)->first(fn (array $property): bool => ($property['id'] ?? null) === $id || ($property['staysListingId'] ?? null) === $id);
        $detail = $this->stays->get('/content/listings/'.rawurlencode($id));
        if (is_array($detail)) {
            $item = $this->mapper->map($detail, $catalog);
        } elseif (app()->isProduction()) {
            return response()->json(['error' => 'Anúncio Stays indisponível'], 503);
        }

        return $item ? response()->json($this->listingPayload($item)) : response()->json(['error' => 'Listing not found in Stays'], 404);
    }

    public function rooms(string $id): JsonResponse
    {
        $item = collect($this->catalog())->first(fn (array $property): bool => ($property['id'] ?? null) === $id || ($property['staysListingId'] ?? null) === $id);
        if (! $item) {
            return response()->json(['error' => 'Rooms not found'], 404);
        }

        return response()->json(array_map(fn (array $room, int $index): array => ['_id' => 'room-'.($index + 1), 'name' => $room['roomName'], 'bedDescription' => $room['bedType'], 'beds' => [['type' => $room['bedType'], 'count' => 1]], 'icon' => $room['icon']], $item['sleepingArrangements'] ?? [], array_keys($item['sleepingArrangements'] ?? [])));
    }

    public function amenities(bool $property): JsonResponse
    {
        $items = $property ? [
            ['thermal_pools', 'Piscinas termais 24h'], ['water_park', 'Parque aquático'], ['parking', 'Estacionamento privativo'], ['reception_24h', 'Recepção 24h'], ['wet_bar', 'Bar molhado'], ['sauna', 'Sauna a vapor'], ['restaurant', 'Restaurante e lanchonete'],
        ] : [
            ['air_conditioning', 'Ar-condicionado'], ['wifi', 'Wi-Fi'], ['kitchen', 'Cozinha'], ['refrigerator', 'Geladeira'], ['microwave', 'Micro-ondas'], ['tv', 'TV'], ['dishes_silverware', 'Louças e talheres'], ['bed_linens', 'Roupa de cama e banho'],
        ];

        return response()->json(array_map(fn (array $item): array => ['code' => $item[0], 'name' => $item[1]], $items));
    }

    public function listingAmenities(): JsonResponse
    {
        return $this->amenities(false);
    }

    public function propertyAmenities(): JsonResponse
    {
        return $this->amenities(true);
    }

    public function searchListings(Request $request): JsonResponse
    {
        $input = $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d'], 'guests' => ['nullable'], 'limit' => ['nullable', 'integer', 'min:1', 'max:100'], 'skip' => ['nullable', 'integer', 'min:0']]);
        $guestCount = max(1, (int) ($input['guests'] ?? 1));
        $nights = isset($input['from'], $input['to']) ? max(1, now()->parse($input['from'])->diffInDays(now()->parse($input['to']))) : 1;
        $items = collect($this->catalog())->filter(fn (array $item): bool => ($item['maxGuests'] ?? 0) >= $guestCount)->slice((int) ($input['skip'] ?? 0), (int) ($input['limit'] ?? 20));

        $live = $this->stays->post('/booking/search-listings', array_filter(['from' => $input['from'] ?? null, 'to' => $input['to'] ?? null, 'guests' => $guestCount, 'limit' => (int) ($input['limit'] ?? 20), 'skip' => (int) ($input['skip'] ?? 0)], fn ($value): bool => $value !== null));
        if (is_array($live)) {
            return response()->json($live);
        }

        return response()->json($items->map(function (array $item) use ($nights): array {
            $item = $this->listingPayload($item);
            $item['bookingPrice'] = ($item['bookingPrice'] ?? 0) * $nights + ($item['cleaningFee'] ?? 0);
            $item['dailyRate'] = $item['dailyRate'] ?? 0;
            $item['nights'] = $nights;

            return $item;
        })->values());
    }

    public function legacyCalendar(): JsonResponse
    {
        return response()->json(['error' => 'This local compatibility endpoint does not contain authoritative availability.'], 410);
    }

    private function catalog(): array
    {
        return json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    private function listingPayload(array $property): array
    {
        return [
            '_id' => $property['id'], 'code' => $property['staysListingId'] ?? $property['id'], '_mstitle' => ['pt_BR' => $property['title']], '_msdesc' => ['pt_BR' => $property['description']],
            '_i_maxGuests' => $property['maxGuests'], '_i_rooms' => $property['bedrooms'], '_i_beds' => $property['beds'], '_f_bathrooms' => $property['bathrooms'],
            'address' => ['street' => $property['location']['address'], 'neighborhood' => $property['location']['neighborhood'], 'city' => $property['location']['city'], 'state' => $property['location']['state'], 'country' => $property['location']['country']],
            'latLng' => ['lat' => $property['location']['lat'], 'lng' => $property['location']['lng']], 'instantBooking' => $property['instantBook'], 'bookingPrice' => $property['pricePerNight'],
            'cleaningFee' => $property['cleaningFee'], '_t_mainImageMeta' => ['url' => $property['images'][0] ?? null], 'images' => $property['images'], 'amenities' => $property['amenities'] ?? [],
            'listingAmenities' => $property['listingAmenities'] ?? [], 'propertyAmenities' => $property['propertyAmenities'] ?? [], 'sleepingArrangements' => $property['sleepingArrangements'] ?? [],
        ];
    }
}
