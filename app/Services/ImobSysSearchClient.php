<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use JsonException;

class ImobSysSearchClient
{
    /** @return list<array<string, mixed>>|null */
    public function offers(string $from, string $to, int $guests, string $destination, ?string $propertyId = null, bool $fresh = false): ?array
    {
        if (! $this->isEnabled()) {
            return null;
        }

        $cacheKey = 'imobsys.search.shared.v4.'.hash('sha256', json_encode([
            config('services.partner_api.base_url'), $from, $to, $guests, $propertyId,
        ], JSON_THROW_ON_ERROR));

        $fetch = function () use ($from, $to, $guests, $propertyId, $fresh): ?array {
            $url = rtrim((string) config('services.partner_api.base_url'), '/').'/v1/offers';

            try {
                $offers = [];
                $page = 1;
                $hasMore = true;
                while ($hasMore && $page <= 5) {
                    $response = $this->request()
                        ->connectTimeout(2)
                        ->timeout(max(2, min(75, (int) config('services.partner_api.timeout', 75))))
                        ->get($url, [
                            'from' => $from,
                            'to' => $to,
                            'guests' => $guests,
                            'page' => $page,
                            'pageSize' => 50,
                            ...($propertyId === null ? [] : ['propertyId' => $propertyId]),
                        ]);

                    if (! $response->successful()) {
                        return null;
                    }

                    $payload = $response->json();
                    $pageOffers = is_array($payload) ? ($payload['offers'] ?? null) : null;
                    $pagination = is_array($payload) ? ($payload['pagination'] ?? null) : null;
                    if (! is_array($pageOffers) || ! array_is_list($pageOffers)
                        || ! is_array($pagination)
                        || ($payload['success'] ?? null) !== true
                        || ($payload['from'] ?? null) !== $from
                        || ($payload['to'] ?? null) !== $to
                        || (int) ($payload['guests'] ?? 0) !== $guests
                        || (int) ($pagination['page'] ?? 0) !== $page
                        || (int) ($pagination['pageSize'] ?? 0) !== 50
                        || ! is_bool($pagination['hasMore'] ?? null)) {
                        return null;
                    }

                    $observedAt = $payload['observedAt'] ?? null;
                    if ($pageOffers !== [] && (! is_string($observedAt) || strtotime($observedAt) === false || strtotime($observedAt) > now()->addSeconds(5)->timestamp)) {
                        return null;
                    }
                    if ($fresh && (! is_string($observedAt) || strtotime($observedAt) === false || strtotime($observedAt) < now()->subSeconds(30)->timestamp || strtotime($observedAt) > now()->addSeconds(5)->timestamp)) {
                        return null;
                    }
                    $supplierExpiresAt = $payload['expiresAt'] ?? null;
                    if ($fresh && (! is_string($supplierExpiresAt) || strtotime($supplierExpiresAt) === false || strtotime($supplierExpiresAt) <= now()->timestamp || strtotime($supplierExpiresAt) <= strtotime($observedAt))) {
                        return null;
                    }
                    if (($supplierExpiresAt !== null || $pageOffers !== []) && (! is_string($supplierExpiresAt) || strtotime($supplierExpiresAt) === false || strtotime($supplierExpiresAt) <= now()->timestamp)) {
                        return null;
                    }
                    if ($pageOffers !== [] && strtotime($supplierExpiresAt) <= strtotime($observedAt)) {
                        return null;
                    }
                    if (! is_string($observedAt) || strtotime($observedAt) === false) {
                        $observedAt = now()->toIso8601String();
                    }
                    $guestCountVerified = ($payload['guestCountVerified'] ?? null) === true;
                    $supplierExpiryTimestamp = is_string($supplierExpiresAt) ? strtotime($supplierExpiresAt) : null;
                    $offers = [...$offers, ...array_map(static fn (mixed $offer): mixed => is_array($offer) ? [...$offer, '_crcnObservedAt' => $observedAt, '_crcnGuestCountVerified' => $guestCountVerified, '_crcnSupplierExpiresAt' => $supplierExpiryTimestamp] : $offer, $pageOffers)];
                    if ($propertyId !== null && collect($pageOffers)->contains(fn (mixed $offer): bool => is_array($offer) && ($offer['id'] ?? null) === $propertyId)) {
                        $hasMore = false;
                        break;
                    }
                    $hasMore = $pagination['hasMore'];
                    $page++;
                }
                if ($hasMore) {
                    return null;
                }
            } catch (ConnectionException) {
                return null;
            }

            $expiresAt = now()->addSeconds(max(1, min(60, (int) config('services.partner_api.cache_ttl', 25))))->getTimestamp();

            return array_map(static fn (mixed $offer): mixed => is_array($offer) ? [...$offer, '_crcnExpiresAt' => is_int($offer['_crcnSupplierExpiresAt'] ?? null) ? min($expiresAt, $offer['_crcnSupplierExpiresAt']) : $expiresAt] : $offer, $offers);
        };
        $offers = $fresh ? $fetch() : Cache::remember($cacheKey, max(1, min(60, (int) config('services.partner_api.cache_ttl', 25))), $fetch);

        if (! $fresh && is_array($offers) && collect($offers)->contains(static fn (mixed $offer): bool => is_array($offer) && is_int($offer['_crcnExpiresAt'] ?? null) && $offer['_crcnExpiresAt'] <= now()->timestamp)) {
            Cache::forget($cacheKey);
            $offers = $fetch();
        }

        if ($offers === null || collect($offers)->contains(static fn (mixed $offer): bool => is_array($offer) && is_int($offer['_crcnExpiresAt'] ?? null) && $offer['_crcnExpiresAt'] <= now()->timestamp)) {
            return null;
        }

        $normalizedDestination = $this->normalize($destination);

        return collect($offers)
            ->filter(function (mixed $offer) use ($normalizedDestination, $guests, $from, $to, $propertyId): bool {
                if (! is_array($offer)
                    || ($offer['from'] ?? null) !== $from
                    || ($offer['to'] ?? null) !== $to
                    || ! is_string($offer['id'] ?? null)
                    || preg_match('/^imobsys-crcn-[1-9]\d*-[1-9]\d*$/', $offer['id']) !== 1
                    || ($propertyId !== null && $offer['id'] !== $propertyId)
                    || ! is_int($offer['totalCents'] ?? null)
                    || $offer['totalCents'] < 1
                    || ! is_int($offer['capacity'] ?? null)
                    || $offer['capacity'] < $guests
                    || (int) ($offer['guests'] ?? 0) !== $guests
                    || ($offer['currency'] ?? null) !== 'BRL'
                    || ! is_int($offer['nights'] ?? null)
                    || $offer['nights'] < 1
                    || ! is_bool($offer['availabilityConfirmed'] ?? null)
                    || ($offer['reservationGuaranteed'] ?? null) !== false
                    || ($offer['status'] ?? null) !== 'offer_observed') {
                    return false;
                }

                $normalizedCondominium = $this->normalize((string) ($offer['condominiumName'] ?? ''));

                return $normalizedDestination === '' || $normalizedCondominium === $normalizedDestination;
            })
            ->values()
            ->all();
    }

    public function isEnabled(): bool
    {
        $baseUrl = (string) config('services.partner_api.base_url');

        return (bool) config('services.partner_api.search_fallback_enabled')
            && filter_var($baseUrl, FILTER_VALIDATE_URL) !== false
            && (parse_url($baseUrl, PHP_URL_SCHEME) === 'https' || app()->environment(['local', 'testing']))
            && parse_url($baseUrl, PHP_URL_USER) === null
            && parse_url($baseUrl, PHP_URL_QUERY) === null
            && parse_url($baseUrl, PHP_URL_FRAGMENT) === null
            && trim((string) config('services.partner_api.key')) !== '';
    }

    public function verifiedStaysPropertyId(string $destination): ?string
    {
        $normalized = $this->normalize($destination);
        if ($normalized === '') {
            return null;
        }
        $path = base_path('integrations/imobsys/condominium-crosswalk.json');
        $contents = is_file($path) ? file_get_contents($path) : false;
        if (! is_string($contents)) {
            return null;
        }
        try {
            $crosswalk = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }
        $matches = [];
        foreach (($crosswalk['verified'] ?? []) as $mapping) {
            if (! is_array($mapping)
                || ! str_starts_with((string) ($mapping['matchStatus'] ?? ''), 'verified_')
                || ($mapping['staysStatus'] ?? null) !== 'active'
                || ($mapping['imobsysStatus'] ?? null) !== 'active'
                || ! is_string($mapping['staysPropertyId'] ?? null)
                || trim($mapping['staysPropertyId']) === '') {
                continue;
            }
            foreach (['canonicalName', 'staysName', 'imobsysName'] as $field) {
                if (is_string($mapping[$field] ?? null) && $this->normalize($mapping[$field]) === $normalized) {
                    $matches[$mapping['staysPropertyId']] = true;
                }
            }
        }

        return count($matches) === 1 ? (string) array_key_first($matches) : null;
    }

    public function verifiedCondominiumName(string $staysPropertyId): ?string
    {
        if (! $this->isEnabled() || trim($staysPropertyId) === '') {
            return null;
        }

        $cacheKey = 'imobsys.crosswalk.'.hash('sha256', $staysPropertyId);

        $name = Cache::remember($cacheKey, 60, function () use ($staysPropertyId): string {
            $path = base_path('integrations/imobsys/condominium-crosswalk.json');
            $contents = is_file($path) ? file_get_contents($path) : false;
            if (! is_string($contents)) {
                return '';
            }

            try {
                $crosswalk = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                return '';
            }

            $mappings = is_array($crosswalk) ? ($crosswalk['verified'] ?? null) : null;
            if (! is_array($mappings) || ! array_is_list($mappings)) {
                return '';
            }

            foreach ($mappings as $mapping) {
                if (! is_array($mapping)
                    || ($mapping['staysPropertyId'] ?? null) !== $staysPropertyId
                    || ! str_starts_with((string) ($mapping['matchStatus'] ?? ''), 'verified_')
                    || ($mapping['staysStatus'] ?? null) !== 'active'
                    || ($mapping['imobsysStatus'] ?? null) !== 'active'
                    || ! is_string($mapping['imobsysName'] ?? null)
                    || trim($mapping['imobsysName']) === '') {
                    continue;
                }

                return trim($mapping['imobsysName']);
            }

            return '';
        });

        return $name !== '' ? $name : null;
    }

    public function catalogCondominiumId(string $id): ?string
    {
        $path = base_path('integrations/imobsys/condominium-crosswalk.json');
        $contents = is_file($path) ? file_get_contents($path) : false;
        if (! is_string($contents)) {
            return null;
        }
        try {
            $crosswalk = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }
        $ids = [];
        foreach (($crosswalk['verified'] ?? []) as $mapping) {
            if (! is_array($mapping) || ($mapping['imobsysStatus'] ?? null) !== 'active'
                || ! str_starts_with((string) ($mapping['matchStatus'] ?? ''), 'verified_')) {
                continue;
            }
            $partnerId = is_string($mapping['imobsysProviderId'] ?? null) && ctype_digit($mapping['imobsysProviderId'])
                ? 'imobsys-condo-'.$mapping['imobsysProviderId'] : null;
            $catalogId = $mapping['imobsysCondominiumId'] ?? null;
            if ((($mapping['staysPropertyId'] ?? null) === $id || $partnerId === $id)
                && is_string($catalogId) && preg_match('/^imobsys-crcn-condo-[1-9]\d*$/', $catalogId)) {
                $ids[$catalogId] = true;
            }
        }

        return count($ids) === 1 ? (string) array_key_first($ids) : null;
    }

    public function catalogCondominiumName(string $id): ?string
    {
        if (! preg_match('/^imobsys-condo-([1-9]\d*)$/', $id, $match)) {
            return $this->verifiedCondominiumName($id);
        }
        $path = base_path('integrations/imobsys/condominium-crosswalk.json');
        $contents = is_file($path) ? file_get_contents($path) : false;
        if (! is_string($contents)) {
            return null;
        }
        try {
            $crosswalk = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }
        $names = [];
        foreach (($crosswalk['verified'] ?? []) as $mapping) {
            if (is_array($mapping) && ($mapping['imobsysProviderId'] ?? null) === $match[1]
                && ($mapping['imobsysStatus'] ?? null) === 'active'
                && str_starts_with((string) ($mapping['matchStatus'] ?? ''), 'verified_')
                && is_string($mapping['imobsysName'] ?? null) && trim($mapping['imobsysName']) !== '') {
                $names[trim($mapping['imobsysName'])] = true;
            }
        }

        return count($names) === 1 ? (string) array_key_first($names) : null;
    }

    /** @return list<array<string, mixed>>|null */
    public function catalogForCondominium(string $name, int $guests, ?string $condominiumId = null): ?array
    {
        $normalized = $this->normalize($name);
        if (! $this->isEnabled() || $normalized === '' || $guests < 1) {
            return null;
        }

        $items = [];
        $revision = null;
        try {
            for ($page = 1; $page <= 5; $page++) {
                $response = $this->request()->connectTimeout(2)->timeout(10)
                    ->get(rtrim((string) config('services.partner_api.base_url'), '/').'/v1/properties', ['page' => $page, 'pageSize' => 50]);
                $payload = $response->json();
                $pagination = is_array($payload) ? ($payload['pagination'] ?? null) : null;
                if (! $response->successful() || ($payload['success'] ?? null) !== true
                    || ! is_array($payload['data'] ?? null) || ! array_is_list($payload['data'])
                    || ! is_array($pagination) || ($pagination['page'] ?? null) !== $page
                    || ($pagination['pageSize'] ?? null) !== 50 || ! is_bool($pagination['hasMore'] ?? null)
                    || ! is_int($payload['publicationRevision'] ?? null)
                    || ($revision !== null && $revision !== $payload['publicationRevision'])) {
                    return null;
                }
                $revision = $payload['publicationRevision'];
                foreach ($payload['data'] as $item) {
                    if (! is_array($item) || ! is_string($item['id'] ?? null)
                        || preg_match('/^imobsys-crcn-[1-9]\d{0,8}-[1-9]\d{0,11}$/', $item['id']) !== 1
                        || ! is_string($item['title'] ?? null) || trim($item['title']) === ''
                        || ! is_int($item['capacity'] ?? null) || $item['capacity'] < $guests
                        || ($condominiumId !== null && ($item['condominiumId'] ?? null) !== $condominiumId)
                        || ! is_string($item['condominiumName'] ?? null)
                        || ($condominiumId === null && $this->normalize($item['condominiumName']) !== $normalized)) {
                        continue;
                    }
                    $items[] = $item;
                }
                if (! $pagination['hasMore']) {
                    return $items;
                }
            }
        } catch (ConnectionException) {
            return null;
        }

        return null;
    }

    /** @param list<array<string, mixed>> $items
     * @return list<array<string, mixed>>
     */
    public function mapCatalogProperties(array $items): array
    {
        return array_map(fn (array $item): array => [
            'id' => $item['id'], 'dataSource' => 'imobsys-live',
            'title' => trim($item['title']), 'subtitle' => $item['condominiumName'], 'complexName' => $item['condominiumName'],
            'description' => is_string($item['description'] ?? null) ? trim(strip_tags($item['description'])) : '',
            'category' => 'accommodation', 'propertyType' => 'entire_place',
            'location' => ['city' => '', 'state' => '', 'country' => '', 'neighborhood' => $item['condominiumName'], 'address' => '', 'lat' => 0, 'lng' => 0],
            'pricePerNight' => 0, 'cleaningFee' => 0, 'serviceFeeRate' => 0,
            'rating' => 0, 'reviewCount' => 0, 'isSuperhost' => false, 'isGuestFavorite' => false, 'instantBook' => false,
            'images' => $this->validImages($item['images'] ?? null), 'bedrooms' => 0, 'beds' => 0, 'bathrooms' => 0,
            'maxGuests' => $item['capacity'], 'amenities' => [], 'highlights' => [], 'sleepingArrangements' => [], 'rules' => [],
            'host' => ['name' => '', 'avatar' => '', 'joinedYear' => 0, 'isSuperhost' => false, 'responseTime' => '', 'responseRate' => '', 'bio' => ''],
            'reviews' => [],
        ], $items);
    }

    /** @param list<array<string, mixed>> $offers
     * @return list<array<string, mixed>>
     */
    public function mapOffers(array $offers, string $from, string $to): array
    {
        $nights = (int) ((strtotime($to) - strtotime($from)) / 86400);
        if ($nights < 1) {
            return [];
        }

        return array_map(function (array $offer) use ($from, $to, $nights): array {
            $condominium = trim((string) ($offer['condominiumName'] ?? ''));
            $unit = trim((string) ($offer['unit'] ?? ''));
            $title = trim((string) ($offer['title'] ?? ''));
            if ($title === '') {
                $title = trim($condominium.($unit === '' ? '' : ' | Apto '.$unit));
            }

            return [
                'id' => $offer['id'],
                'dataSource' => 'imobsys-live',
                'imobsysOffer' => [
                    'from' => $from,
                    'to' => $to,
                    'nights' => $nights,
                    'totalAmount' => $offer['totalCents'] / 100,
                    'currency' => 'BRL',
                    'observedAt' => is_string($offer['_crcnObservedAt'] ?? null) ? $offer['_crcnObservedAt'] : now()->toIso8601String(),
                    'availabilityConfirmed' => false,
                    'expiresAt' => ((int) ($offer['_crcnExpiresAt'] ?? now()->addSeconds(max(1, min(60, (int) config('services.partner_api.cache_ttl', 25))))->getTimestamp())) * 1000,
                ],
                'title' => $title !== '' ? $title : trim($condominium.' '.$unit),
                'subtitle' => $condominium,
                'description' => trim((string) ($offer['description'] ?? '')),
                'category' => 'accommodation',
                'propertyType' => 'entire_place',
                'location' => [
                    'city' => 'Caldas Novas', 'state' => 'GO', 'country' => 'Brasil',
                    'neighborhood' => $condominium, 'address' => '', 'lat' => 0, 'lng' => 0,
                ],
                'pricePerNight' => 0,
                'cleaningFee' => 0,
                'serviceFeeRate' => 0,
                'rating' => 0,
                'reviewCount' => 0,
                'isSuperhost' => false,
                'isGuestFavorite' => false,
                'instantBook' => false,
                'images' => $this->validImages($offer['images'] ?? null),
                'bedrooms' => 0,
                'beds' => 0,
                'bathrooms' => 0,
                'maxGuests' => $offer['capacity'],
                'amenities' => [],
                'highlights' => [],
                'sleepingArrangements' => [],
                'rules' => [],
                'host' => [
                    'name' => '', 'avatar' => '', 'joinedYear' => 0, 'isSuperhost' => false,
                    'responseTime' => '', 'responseRate' => '', 'bio' => '',
                ],
                'reviews' => [],
            ];
        }, $offers);
    }

    /** @return list<string>|null */
    public function propertyImages(string $id): ?array
    {
        return $this->propertyContent($id)['images'] ?? null;
    }

    /** @return array{images: list<string>, description: ?string}|null */
    public function propertyContent(string $id): ?array
    {
        if (! $this->isEnabled() || preg_match('/^imobsys-crcn-[1-9]\d{0,8}-[1-9]\d{0,11}$/', $id) !== 1) {
            return null;
        }

        $cacheKey = 'imobsys.content.v3.'.hash('sha256', $id);

        return Cache::remember($cacheKey, 600, function () use ($id): ?array {
            $url = rtrim((string) config('services.partner_api.base_url'), '/').'/v1/properties/'.rawurlencode($id);

            try {
                $response = $this->request()
                    ->connectTimeout(2)
                    ->timeout(max(2, min(10, (int) config('services.partner_api.timeout', 8))))
                    ->get($url);
            } catch (ConnectionException) {
                return null;
            }

            if (! $response->successful()
                || $response->json('success') !== true
                || ! is_array($response->json('data'))
                || ($response->json('data.0.id') ?? null) !== $id) {
                return null;
            }

            $images = $response->json('data.0.images');
            if (! is_array($images) || ! array_is_list($images)) {
                return null;
            }

            $description = $response->json('data.0.description');

            return [
                'images' => $this->validImages($images),
                'description' => is_string($description) && mb_strlen($description) <= 10000 ? trim(strip_tags($description)) : null,
            ];
        });
    }

    /** @param list<array<string, mixed>> $properties */
    public function rememberProperties(array $properties): void
    {
        foreach ($properties as $property) {
            if (is_string($property['id'] ?? null) && str_starts_with($property['id'], 'imobsys-crcn-')) {
                Cache::put('imobsys.property.'.hash('sha256', $property['id']), $property, now()->addMinutes(30));
            }
        }
    }

    /** @return array<string, mixed>|null */
    public function cachedProperty(string $id): ?array
    {
        $property = Cache::get('imobsys.property.'.hash('sha256', $id));

        return is_array($property) && ($property['id'] ?? null) === $id ? $property : null;
    }

    private function normalize(string $value): string
    {
        $normalized = Str::ascii(mb_strtolower($value));

        return preg_replace('/[^a-z0-9]+/', '', $normalized) ?? '';
    }

    private function request(): PendingRequest
    {
        return Http::acceptJson()->withToken((string) config('services.partner_api.key'))->withoutRedirecting();
    }

    /** @return list<string> */
    private function validImages(mixed $images): array
    {
        if (! is_array($images) || ! array_is_list($images)) {
            return [];
        }

        return array_values(array_filter($images, static function (mixed $image): bool {
            if (! is_string($image) || filter_var($image, FILTER_VALIDATE_URL) === false) {
                return false;
            }

            $url = parse_url($image);

            return ($url['scheme'] ?? null) === 'https'
                && ($url['host'] ?? null) === 'reservascrcn.com.br'
                && preg_match('~^/fotos/[^/]+/imoveis/[^/]+/fotos/~', $url['path'] ?? '') === 1;
        }));
    }
}
