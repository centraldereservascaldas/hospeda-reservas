<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class DiogoPropertyCatalog
{
    private const PAGE_SIZE = 50;

    private const MAX_PAGES = 10;

    public function isConfigured(): bool
    {
        return trim((string) config('services.diogo.api_key')) !== ''
            && filter_var(config('services.diogo.base_url'), FILTER_VALIDATE_URL) !== false
            && str_starts_with((string) config('services.diogo.base_url'), 'https://');
    }

    /** @return list<array<string, mixed>>|null */
    public function all(): ?array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $cacheKey = $this->cacheKey();
        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        $properties = $this->fetchCatalog();
        if ($properties !== null) {
            Cache::put($cacheKey, $properties, max(30, (int) config('services.diogo.catalog_cache_ttl', 300)));
        }

        return $properties;
    }

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        $sourceId = $this->sourceIdForPublicId($id);
        if (! $this->isConfigured() || $sourceId === null) {
            return null;
        }

        $cacheKey = $this->cacheKey().':'.hash('sha256', $id);
        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        $payload = $this->request('/v1/properties/'.rawurlencode($sourceId));
        if (! is_array($payload) || ($payload['success'] ?? false) !== true || ! is_array($payload['data'] ?? null)) {
            return null;
        }

        $property = collect($payload['data'])
            ->filter(fn (mixed $item): bool => is_array($item))
            ->map(fn (array $item): ?array => $this->map($item, allowUnknownCapacity: true))
            ->first(fn (?array $item): bool => is_array($item) && $item['id'] === $id);
        if ($property !== null) {
            Cache::put($cacheKey, $property, max(30, (int) config('services.diogo.catalog_cache_ttl', 300)));
        }

        return $property;
    }

    /**
     * @param  array<string, mixed>  $offer
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>|null
     */
    public function mapObservedOffer(array $offer, array $query, string $observedAt, string $expiresAt): ?array
    {
        $from = strtotime($observedAt);
        $until = strtotime($expiresAt);
        $nights = (int) (new \DateTimeImmutable($query['from']))->diff(new \DateTimeImmutable($query['to']))->days;
        $totalCents = $offer['totalCents'] ?? null;
        if (($offer['from'] ?? null) !== $query['from']
            || ($offer['to'] ?? null) !== $query['to']
            || ($offer['guests'] ?? null) !== $query['guests']
            || ($offer['nights'] ?? null) !== $nights
            || ! is_int($totalCents) || $totalCents < 1
            || ($offer['currency'] ?? null) !== 'BRL'
            || ($offer['paymentMethod'] ?? null) !== 'pix'
            || ($offer['feeBreakdownAvailable'] ?? null) !== false
            || ($offer['additionalChargesKnown'] ?? null) !== false
            || ($offer['status'] ?? null) !== 'offer_observed'
            || ($offer['availabilityConfirmed'] ?? null) !== false
            || ($offer['reservationGuaranteed'] ?? null) !== false
            || ! is_int($from) || ! is_int($until) || $until <= now()->timestamp) {
            return null;
        }

        $property = $this->map([
            'id' => $offer['id'] ?? null,
            'title' => $offer['title'] ?? null,
            'condominiumId' => $offer['condominiumId'] ?? null,
            'condominiumName' => $offer['condominiumName'] ?? null,
            'capacity' => $offer['capacity'] ?? null,
            'description' => $offer['description'] ?? null,
            'amenities' => $offer['amenities'] ?? [],
            'images' => $offer['images'] ?? [],
            'mediaStatus' => $offer['mediaStatus'] ?? null,
        ], allowUnknownCapacity: true);
        if ($property === null) {
            return null;
        }

        $property['observedOffer'] = [
            'from' => $query['from'],
            'to' => $query['to'],
            'guests' => $query['guests'],
            'totalAmount' => $totalCents / 100,
            'currency' => 'BRL',
            'paymentMethod' => 'pix',
            'nights' => $nights,
            'observedAt' => $observedAt,
            'expiresAt' => $until * 1000,
            'availabilityConfirmed' => false,
            'guestCountVerified' => false,
            'feeBreakdownAvailable' => false,
            'additionalChargesKnown' => false,
        ];

        return $property;
    }

    private function cacheKey(): string
    {
        return 'diogo.published-properties.v1:'.hash('sha256', rtrim((string) config('services.diogo.base_url'), '/').':'.(string) config('services.diogo.api_key'));
    }

    /** @return list<array<string, mixed>>|null */
    private function fetchCatalog(): ?array
    {
        $properties = [];
        $page = 1;

        do {
            $payload = $this->request('/v1/properties', ['page' => $page, 'pageSize' => self::PAGE_SIZE]);
            if (! is_array($payload)
                || ($payload['success'] ?? false) !== true
                || ! is_array($payload['data'] ?? null)
                || ! is_array($payload['pagination'] ?? null)) {
                return null;
            }

            foreach ($payload['data'] as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $mapped = $this->map($item, allowUnknownCapacity: true);
                if ($mapped !== null) {
                    $properties[$mapped['id']] = $mapped;
                }
            }

            $hasMore = ($payload['pagination']['hasMore'] ?? false) === true;
            $page++;
        } while ($hasMore && $page <= self::MAX_PAGES);

        return array_values($properties);
    }

    /** @return array<string, mixed>|null */
    private function request(string $path, array $query = []): ?array
    {
        try {
            $response = Http::acceptJson()
                ->withToken((string) config('services.diogo.api_key'))
                ->connectTimeout(2)
                ->timeout(max(1, min(5, (int) config('services.diogo.timeout', 3))))
                ->get(rtrim((string) config('services.diogo.base_url'), '/').$path, $query);
        } catch (ConnectionException) {
            return null;
        }

        $payload = $response->successful() ? $response->json() : null;

        return is_array($payload) ? $payload : null;
    }

    /** @param array<string, mixed> $item
     * @return array<string, mixed>|null
     */
    private function map(array $item, bool $allowUnknownCapacity = false): ?array
    {
        $sourceId = $item['id'] ?? null;
        $title = $item['title'] ?? null;
        $capacity = $item['capacity'] ?? null;
        $hasKnownCapacity = is_int($capacity) && $capacity >= 1 && $capacity <= 100;
        if (! is_string($sourceId) || preg_match('/^imobsys-crcn-([1-9]\d{0,8})-([1-9]\d{0,11})$/D', $sourceId, $matches) !== 1
            || ! is_string($title) || trim($title) === ''
            || (! $hasKnownCapacity && ! $allowUnknownCapacity)) {
            return null;
        }
        $publicId = 'PAR-'.$matches[1].'-'.$matches[2];

        $images = [];
        if (($item['mediaStatus'] ?? null) === 'available' && is_array($item['images'] ?? null)) {
            foreach ($item['images'] as $image) {
                if (is_string($image) && $this->isApprovedImageUrl($image)) {
                    $images[] = $image;
                }
                if (count($images) >= 30) {
                    break;
                }
            }
        }

        $amenities = is_array($item['amenities'] ?? null)
            ? collect($item['amenities'])->filter(fn (mixed $value): bool => is_string($value) && trim($value) !== '')
                ->map(fn (string $value): string => trim($value))->unique()->values()->all()
            : [];
        $condominiumName = is_string($item['condominiumName'] ?? null) ? trim($item['condominiumName']) : '';
        $description = is_string($item['description'] ?? null) ? trim(strip_tags($item['description'])) : '';

        return [
            'id' => $publicId,
            'bookingProvider' => 'partner',
            'dataSource' => 'partner-live',
            'title' => trim($title),
            'subtitle' => $condominiumName,
            'description' => $description,
            'category' => 'accommodation',
            'propertyType' => 'entire_place',
            'location' => [
                'city' => '', 'state' => '', 'country' => '', 'neighborhood' => '', 'address' => '', 'lat' => 0, 'lng' => 0,
            ],
            'pricePerNight' => 0,
            'cleaningFee' => 0,
            'serviceFeeRate' => 0,
            'rating' => 0,
            'reviewCount' => 0,
            'isSuperhost' => false,
            'isGuestFavorite' => false,
            'instantBook' => false,
            'images' => $images,
            'bedrooms' => 0,
            'beds' => 0,
            'bathrooms' => 0,
            'maxGuests' => $hasKnownCapacity ? $capacity : 0,
            'amenities' => $amenities,
            'listingAmenities' => $amenities,
            'propertyAmenities' => [],
            'highlights' => [],
            'sleepingArrangements' => [],
            'rules' => [],
            'host' => ['name' => '', 'avatar' => '', 'joinedYear' => 0, 'isSuperhost' => false, 'responseTime' => '', 'responseRate' => '', 'bio' => ''],
            'reviews' => [],
            'staysSynced' => false,
            'complexName' => $condominiumName,
            'partnerCondominiumId' => is_string($item['condominiumId'] ?? null) ? $item['condominiumId'] : null,
        ];
    }

    private function sourceIdForPublicId(string $id): ?string
    {
        if (preg_match('/^PAR-([1-9]\d{0,8})-([1-9]\d{0,11})$/D', $id, $matches) !== 1) {
            return null;
        }

        return 'imobsys-crcn-'.$matches[1].'-'.$matches[2];
    }

    private function isApprovedImageUrl(string $image): bool
    {
        $url = parse_url($image);

        return is_array($url)
            && ($url['scheme'] ?? null) === 'https'
            && ($url['host'] ?? null) === 'reservascrcn.com.br'
            && ! isset($url['user'])
            && ! isset($url['pass'])
            && preg_match('~^/fotos/[^/]+/imoveis/[^/]+/fotos/.+~', (string) ($url['path'] ?? '')) === 1;
    }
}
