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
    public function offers(string $from, string $to, int $guests, string $destination, ?string $propertyId = null): ?array
    {
        if (! $this->isEnabled()) {
            return null;
        }

        $cacheKey = 'imobsys.search.shared.v2.'.hash('sha256', json_encode([
            config('services.imobsys.base_url'), config('services.imobsys.host_header'), $from, $to, $guests, $propertyId,
        ], JSON_THROW_ON_ERROR));

        $offers = Cache::remember($cacheKey, max(1, min(60, (int) config('services.imobsys.cache_ttl', 25))), function () use ($from, $to, $guests, $propertyId): ?array {
            $url = rtrim((string) config('services.imobsys.base_url'), '/').'/internal/offers/search';

            try {
                $offers = [];
                $page = 1;
                $hasMore = true;
                while ($hasMore && $page <= 5) {
                    $response = $this->request()
                        ->connectTimeout(2)
                        ->timeout(max(2, min(65, (int) config('services.imobsys.timeout', 8))))
                        ->get($url, [
                            'from' => $from,
                            'to' => $to,
                            'guests' => $guests,
                            'page' => $page,
                            'pageSize' => 100,
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
                        || ($payload['source'] ?? null) !== 'imobsys-live'
                        || ($payload['from'] ?? null) !== $from
                        || ($payload['to'] ?? null) !== $to
                        || (int) ($payload['guests'] ?? 0) !== $guests
                        || (int) ($pagination['page'] ?? 0) !== $page
                        || (int) ($pagination['pageSize'] ?? 0) !== 100
                        || ! is_bool($pagination['hasMore'] ?? null)) {
                        return null;
                    }

                    $observedAt = $payload['observedAt'] ?? null;
                    if (! is_string($observedAt) || strtotime($observedAt) === false) {
                        $observedAt = now()->toIso8601String();
                    }
                    $offers = [...$offers, ...array_map(static fn (mixed $offer): mixed => is_array($offer) ? [...$offer, '_crcnObservedAt' => $observedAt] : $offer, $pageOffers)];
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

            $expiresAt = now()->addSeconds(max(1, min(60, (int) config('services.imobsys.cache_ttl', 25))))->getTimestamp();

            return array_map(static fn (mixed $offer): mixed => is_array($offer) ? [...$offer, '_crcnExpiresAt' => $expiresAt] : $offer, $offers);
        });

        if ($offers === null) {
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
                    || ($offer['availabilityConfirmed'] ?? null) !== false
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
        return (bool) config('services.imobsys.search_fallback_enabled')
            && filter_var((string) config('services.imobsys.base_url'), FILTER_VALIDATE_URL) !== false
            && preg_match('/^[a-f0-9]{64}$/i', (string) config('services.imobsys.control_key')) === 1;
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
            $title = trim($condominium.($unit === '' ? '' : ' | Apto '.$unit));

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
                    'expiresAt' => ((int) ($offer['_crcnExpiresAt'] ?? now()->addSeconds(max(1, min(60, (int) config('services.imobsys.cache_ttl', 25))))->getTimestamp())) * 1000,
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

        $cacheKey = 'imobsys.content.v2.'.hash('sha256', $id);

        return Cache::remember($cacheKey, 600, function () use ($id): ?array {
            $localMedia = app()->environment(['local', 'testing'])
                && config('services.imobsys.media_base_url') === 'http://127.0.0.1:8012'
                && preg_match('/^[a-f0-9]{64}$/i', (string) config('services.imobsys.media_control_key')) === 1;
            $baseUrl = $localMedia ? config('services.imobsys.media_base_url') : config('services.imobsys.base_url');
            $url = rtrim((string) $baseUrl, '/').'/internal/properties/'.rawurlencode($id).'/media';

            try {
                $request = $localMedia
                    ? Http::acceptJson()->withHeader('X-Local-Control', (string) config('services.imobsys.media_control_key'))
                    : $this->request();
                $response = $request
                    ->connectTimeout(2)
                    ->timeout(max(2, min(10, (int) config('services.imobsys.timeout', 8))))
                    ->get($url);
            } catch (ConnectionException) {
                return null;
            }

            if (! $response->successful()
                || $response->json('success') !== true
                || $response->json('source') !== 'imobsys-public-site'
                || $response->json('propertyId') !== $id) {
                return null;
            }

            $images = $response->json('images');
            if (! is_array($images) || ! array_is_list($images)) {
                return null;
            }

            $description = $response->json('description');

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
        $request = Http::acceptJson()
            ->withHeader('X-Local-Control', (string) config('services.imobsys.control_key'));
        $hostHeader = trim((string) config('services.imobsys.host_header'));

        if (app()->environment(['local', 'testing'])
            && preg_match('/^[a-zA-Z0-9.-]+(?::[1-9][0-9]{0,4})?$/D', $hostHeader) === 1) {
            return $request->withHeader('Host', $hostHeader);
        }

        return $request;
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
