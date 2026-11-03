<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SearchAccommodationsRequest;
use App\Http\Resources\AccommodationSearchResource;
use App\Services\StaysCalendarService;
use App\Services\StaysDiscoveryCatalog;
use App\Services\StaysExternalApiClient;
use App\Services\StaysSearchQuoteService;
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

    /** @var array<string, string> */
    private array $amenityNameDictionary = [];

    private bool $amenityNameDictionaryLoaded = false;

    /** @var array<string, array<string, mixed>> */
    private array $staysPropertiesById = [];

    private bool $staysPropertyCatalogLoaded = false;

    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysDiscoveryCatalog $discovery) {}

    public function resorts(): JsonResponse
    {
        $properties = $this->stays->get('/content/properties', ['status' => 'active', 'limit' => 100, 'skip' => 0]);
        if ($properties === null) {
            return response()->json(['success' => false, 'source' => 'unavailable', 'data' => []], 503);
        }

        $resorts = collect($properties)->map(fn (array $item): array => [
            'id' => (string) ($item['_id'] ?? $item['id'] ?? ''),
            'name' => $this->localized($item['_mstitle'] ?? null) ?: ($item['internalName'] ?? ''),
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

                        $mapped = array_map(fn (array $listing): array => $this->mapListing($listing, $fallback), $listings);

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
            $existing = $this->mapListing($detail, $fallback);
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

    public function search(SearchAccommodationsRequest $request, StaysSimulator $simulator, StaysSearchQuoteService $quoteService): JsonResponse
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
            $live = $this->stays->post('/booking/search-listings', array_filter([
                'from' => $from, 'to' => $to, 'guests' => $guests, 'isBookable' => true,
                'properties' => isset($input['propertyId']) ? [$input['propertyId']] : null,
                'cities' => $input['cities'] ?? null, 'limit' => $limit, 'skip' => $skip,
            ], fn ($value): bool => $value !== null));
            if (! is_array($live) || ! array_is_list($live)
                || array_filter($live, 'is_array') !== $live || count($live) > $limit) {
                return response()->json(['success' => false, 'code' => 'availability_unavailable', 'message' => 'Não foi possível confirmar a disponibilidade agora. Tente novamente.'], 503);
            }

            $resolved = $quoteService->resolve($live, $from, $to, $guests);
            $catalog = $this->catalog();
            $mapped = array_map(function (array $listing) use ($catalog): array {
                $property = $this->mapListing($listing, $catalog);
                $property['calculatedPrice'] = $listing['calculatedPrice'];
                $property['pricePerNight'] = $listing['calculatedPrice']['dailyRate'];

                return $property;
            }, $resolved['items']);

            return (new AccommodationSearchResource([
                'data' => $mapped,
                'from' => $from,
                'to' => $to,
                'guests' => $guests,
                'unquotedCount' => $resolved['unquotedCount'],
                'pagination' => [
                    'receivedCount' => count($live),
                    'nextSkip' => $skip + count($live),
                    'hasMore' => count($live) === $limit,
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
            $property = $detail ? $this->mapListing($detail, $this->catalog()) : null;
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
            return response()->json(array_map(fn (array $item): array => $this->listingPayload($this->mapListing($item, $catalog)), $live));
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
            $item = $this->mapListing($detail, $catalog);
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

    private function localized(mixed $value): string
    {
        if (is_string($value)) {
            return $value;
        }
        if (is_array($value)) {
            return (string) ($value['pt_BR'] ?? $value['pt-BR'] ?? $value['pt'] ?? reset($value) ?: '');
        }

        return '';
    }

    /** @return array<int, string> */
    private function mapAmenityNames(mixed $amenities): array
    {
        if (! is_array($amenities)) {
            return [];
        }

        return collect($amenities)
            ->map(function (mixed $amenity): ?string {
                if (is_string($amenity)) {
                    return trim($amenity) !== '' ? trim($amenity) : null;
                }
                if (! is_array($amenity)) {
                    return null;
                }

                $name = $this->localized($amenity['_mstitle'] ?? null) ?: (string) ($amenity['name'] ?? '');
                if (trim($name) !== '') {
                    return trim($name);
                }

                $id = (string) ($amenity['_id'] ?? $amenity['id'] ?? '');

                return $id !== '' ? ($this->amenityNameDictionary()[$id] ?? null) : null;
            })
            ->filter(fn (?string $name): bool => $name !== null && $name !== '')
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<string, string> */
    private function amenityNameDictionary(): array
    {
        if ($this->amenityNameDictionaryLoaded) {
            return $this->amenityNameDictionary;
        }

        $this->amenityNameDictionaryLoaded = true;
        foreach (['/translation/listing-amenities', '/translation/property-amenities'] as $endpoint) {
            $amenities = $this->stays->get($endpoint);
            foreach (is_array($amenities) ? $amenities : [] as $amenity) {
                if (! is_array($amenity)) {
                    continue;
                }

                $id = (string) ($amenity['_id'] ?? '');
                $name = $this->localized($amenity['_mstitle'] ?? null);
                if ($id !== '' && trim($name) !== '') {
                    $this->amenityNameDictionary[$id] = trim($name);
                }
            }
        }

        return $this->amenityNameDictionary;
    }

    /** @return array<string, mixed> */
    private function staysPropertyById(string $propertyId): array
    {
        if ($propertyId === '') {
            return [];
        }

        if (! $this->staysPropertyCatalogLoaded) {
            $this->staysPropertyCatalogLoaded = true;
            for ($skip = 0; $skip < 5000; $skip += 100) {
                $page = $this->stays->get('/content/properties', [
                    'limit' => 100,
                    'skip' => $skip,
                    'status' => 'active',
                ]);
                if (! is_array($page)) {
                    break;
                }

                foreach ($page as $property) {
                    if (! is_array($property)) {
                        continue;
                    }

                    foreach ([(string) ($property['_id'] ?? ''), (string) ($property['id'] ?? '')] as $id) {
                        if ($id !== '') {
                            $this->staysPropertiesById[$id] = $property;
                        }
                    }
                }

                if (count($page) < 100) {
                    break;
                }
            }
        }

        return $this->staysPropertiesById[$propertyId] ?? [];
    }

    private function mapListing(array $listing, array $catalog): array
    {
        $id = (string) ($listing['id'] ?? $listing['code'] ?? $listing['_id'] ?? '');
        $listingIds = array_values(array_filter([
            (string) ($listing['id'] ?? ''),
            (string) ($listing['code'] ?? ''),
            (string) ($listing['_id'] ?? ''),
        ]));
        $existing = collect($catalog)->first(function (array $item) use ($listingIds): bool {
            $catalogIds = array_filter([
                $item['id'] ?? null,
                $item['staysListingId'] ?? null,
                $item['staysListingObjectId'] ?? null,
            ], 'is_string');

            return array_intersect($listingIds, $catalogIds) !== [];
        }) ?? [];
        $hasMatchingCatalogEntry = $existing !== [] && ($existing['staysListingId'] ?? null) === ($listing['id'] ?? $listing['code'] ?? null);
        if (! $hasMatchingCatalogEntry) {
            $existing = [];
        }
        $location = $existing['location'] ?? [];
        $address = $listing['address'] ?? [];
        $latLng = $listing['latLng'] ?? [];
        $subtype = strtolower((string) ($listing['subtype'] ?? ''));
        $propertyType = match ($subtype) {
            'private_room', 'private-room', 'room' => 'private_room',
            'cabin' => 'cabin',
            'villa' => 'villa',
            default => 'entire_place',
        };
        $gallery = collect($listing['_t_imagesMeta'] ?? [])->map(fn ($image) => is_array($image) ? ($image['url'] ?? $image['src'] ?? null) : $image);
        $images = collect([$listing['_t_mainImageMeta']['url'] ?? null, ...$gallery->all(), ...($listing['images'] ?? [])])
            ->filter(fn ($image): bool => is_string($image) && $image !== '')
            ->unique()->values()->all();
        $listingAmenities = $this->mapAmenityNames($listing['amenities'] ?? []);
        if ($listingAmenities === [] && $hasMatchingCatalogEntry) {
            $listingAmenities = $existing['listingAmenities'] ?? [];
        }
        $propertyAmenityItems = $listing['propertyAmenities'] ?? [];
        if ($propertyAmenityItems === []) {
            $propertyAmenityItems = $this->staysPropertyById((string) ($listing['_idproperty'] ?? ''))['amenities'] ?? [];
        }
        $propertyAmenities = $this->mapAmenityNames($propertyAmenityItems);
        if ($propertyAmenities === [] && $hasMatchingCatalogEntry) {
            $propertyAmenities = $existing['propertyAmenities'] ?? [];
        }
        $amenities = collect([
            ...($hasMatchingCatalogEntry ? ($existing['amenities'] ?? []) : []),
            ...$listingAmenities,
            ...$propertyAmenities,
        ])->filter(fn ($amenity): bool => is_string($amenity) && trim($amenity) !== '')
            ->unique()->values()->all();

        $snapshot = $this->discovery->snapshot();
        $complex = $snapshot['properties'][(string) ($listing['_idproperty'] ?? '')] ?? null;
        $publicListing = $snapshot['listings'][(string) ($listing['id'] ?? $id)] ?? null;

        $mappedProperty = array_replace_recursive($existing, [
            'id' => $id, 'staysListingId' => (string) ($listing['id'] ?? $listing['code'] ?? $id), 'staysListingObjectId' => (string) ($listing['_id'] ?? ''), 'staysPropertyId' => (string) ($listing['_idproperty'] ?? ''), 'staysSynced' => true,
            'publicPagePath' => $publicListing !== null ? $this->discovery->listingPath($publicListing) : '',
            'title' => $this->localized($listing['_mstitle'] ?? null) ?: ($listing['internalName'] ?? 'Apartamento Central de Reservas'),
            'subtitle' => $this->localized($listing['_t_typeMeta']['_mstitle'] ?? null) ?: ($hasMatchingCatalogEntry ? ($existing['subtitle'] ?? '') : ''),
            'description' => strip_tags($this->localized($listing['_msdesc'] ?? $listing['description'] ?? null) ?: ($hasMatchingCatalogEntry ? ($existing['description'] ?? '') : '')),
            'complexName' => $complex['name'] ?? ($hasMatchingCatalogEntry ? ($existing['complexName'] ?? '') : ''),
            'complexPageUrl' => $complex !== null && ($complex['listingIds'] ?? []) !== [] ? $this->discovery->propertyPath($complex) : '',
            'complexDescription' => $complex['description'] ?? ($hasMatchingCatalogEntry ? ($existing['complexDescription'] ?? '') : ''),
            'complexImages' => $complex['images'] ?? ($hasMatchingCatalogEntry ? ($existing['complexImages'] ?? []) : []),
            'category' => (string) (collect($listing['listingCategories'] ?? [])->first() ?? 'accommodation'),
            'propertyType' => $propertyType,
            'location' => [
                'city' => $address['city'] ?? $location['city'] ?? '', 'state' => $address['state'] ?? $address['stateCode'] ?? $location['state'] ?? '',
                'country' => ($address['countryCode'] ?? null) === 'BR' ? 'Brasil' : ($location['country'] ?? ''), 'neighborhood' => $address['region'] ?? $address['neighborhood'] ?? $location['neighborhood'] ?? '',
                'address' => trim(implode(', ', array_filter([$address['street'] ?? null, $address['streetNumber'] ?? null]))), 'lat' => $latLng['_f_lat'] ?? $latLng['lat'] ?? $location['lat'] ?? 0, 'lng' => $latLng['_f_lng'] ?? $latLng['lng'] ?? $location['lng'] ?? 0,
            ],
            'pricePerNight' => $listing['dailyRate'] ?? $listing['price'] ?? 0,
            'cleaningFee' => $listing['cleaningFee'] ?? 0, 'serviceFeeRate' => 0,
            'rating' => 0, 'reviewCount' => 0, 'isSuperhost' => false, 'isGuestFavorite' => false,
            'instantBook' => $listing['instantBooking'] ?? false,
            'images' => $images, 'bedrooms' => $listing['_i_rooms'] ?? 0,
            'beds' => $listing['_i_beds'] ?? 0, 'bathrooms' => $listing['_f_bathrooms'] ?? 0,
            'maxGuests' => max(1, (int) ($listing['_i_maxGuests'] ?? 1)),
            'listingAmenities' => $listingAmenities, 'propertyAmenities' => $propertyAmenities,
            'amenities' => $amenities, 'highlights' => [], 'sleepingArrangements' => [], 'rules' => [], 'host' => ['name' => '', 'avatar' => '', 'joinedYear' => 0, 'isSuperhost' => false, 'responseTime' => '', 'responseRate' => '', 'bio' => ''], 'reviews' => [],
        ]);

        $mappedProperty['listingAmenities'] = $listingAmenities;
        $mappedProperty['propertyAmenities'] = $propertyAmenities;
        $mappedProperty['amenities'] = $amenities;

        return $mappedProperty;
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
