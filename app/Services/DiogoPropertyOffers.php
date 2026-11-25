<?php

namespace App\Services;

use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class DiogoPropertyOffers
{
    public function __construct(private readonly DiogoPropertyCatalog $catalog) {}

    /**
     * Fetches only time-bound, observed partner offers. A null result means that
     * the partner endpoint was not usable and must not be presented as empty inventory.
     *
     * @param  array{from: string, to: string, guests: int, propertyId?: string, destination?: string, cities?: list<string>, limit?: int, skip?: int}  $input
     * @return array{items: list<array<string, mixed>>, pagination: array{page: int, pageSize: int, totalObserved: int, hasMore: bool}, observedAt: string, expiresAt: string}|null
     */
    public function search(array $input): ?array
    {
        $apiKey = trim((string) config('services.diogo.offers_api_key'));
        $baseUrl = rtrim((string) config('services.diogo.base_url'), '/');
        if ($apiKey === '' || ! filter_var($baseUrl, FILTER_VALIDATE_URL) || ! str_starts_with($baseUrl, 'https://')) {
            return null;
        }

        $limit = max(1, min(100, (int) ($input['limit'] ?? 12)));
        $skip = max(0, (int) ($input['skip'] ?? 0));
        $page = intdiv($skip, $limit) + 1;
        if ((int) ($input['guests'] ?? 1) > 10 || $page > 10000) {
            return null;
        }
        $query = [
            'from' => $input['from'],
            'to' => $input['to'],
            'guests' => (int) ($input['guests'] ?? 1),
            'page' => $page,
            'pageSize' => $limit,
        ];

        if (! $this->applySupportedDestinationFilter($query, $input)) {
            return null;
        }

        $cacheKey = 'diogo.observed-offers.v1:'.hash('sha256', json_encode([
            $baseUrl,
            $apiKey,
            $query,
        ], JSON_THROW_ON_ERROR));

        try {
            $cached = Cache::get($cacheKey);
            $cachedExpiry = is_array($cached) && is_string($cached['expiresAt'] ?? null)
                ? strtotime($cached['expiresAt'])
                : false;
            if (is_array($cached) && is_int($cachedExpiry) && $cachedExpiry > now()->timestamp + 2) {
                return $cached;
            }
            Cache::forget($cacheKey);
        } catch (QueryException) {
            // Offer lookup can continue when the shared cache is unavailable.
        }

        $result = (function () use ($apiKey, $baseUrl, $query, $page, $limit): ?array {
            try {
                $response = Http::acceptJson()
                    ->withToken($apiKey)
                    ->connectTimeout(1)
                    ->timeout(max(1, min(4, (int) config('services.diogo.timeout', 3))))
                    ->get($baseUrl.'/v1/offers', $query);
            } catch (ConnectionException) {
                return null;
            }

            if (! $response->successful()) {
                return null;
            }

            $payload = $response->json();
            if (! is_array($payload) || ! $this->matchesQuery($payload, $query)) {
                return null;
            }

            $pagination = $payload['pagination'];
            $offers = $payload['offers'];
            if (count($offers) > $limit
                || ($pagination['page'] ?? null) !== $page
                || ($pagination['pageSize'] ?? null) !== $limit
                || ! is_int($pagination['totalObserved'] ?? null)
                || $pagination['totalObserved'] < count($offers)
                || ! is_bool($pagination['hasMore'] ?? null)
                || $pagination['hasMore'] !== ($page * $limit < $pagination['totalObserved'])) {
                return null;
            }

            $items = [];
            foreach ($offers as $offer) {
                if (! is_array($offer)) {
                    return null;
                }
                $property = $this->catalog->mapObservedOffer($offer, $query, $payload['observedAt'], $payload['expiresAt']);
                if ($property === null) {
                    return null;
                }
                $items[] = $property;
            }

            return [
                'items' => $items,
                'pagination' => $pagination,
                'observedAt' => $payload['observedAt'],
                'expiresAt' => $payload['expiresAt'],
            ];
        })();

        if (is_array($result)) {
            $remainingSeconds = strtotime($result['expiresAt']) - now()->timestamp - 1;
            $cacheTtl = min(10, max(0, (int) config('services.diogo.offers_cache_ttl', 10)), $remainingSeconds);
            if ($cacheTtl > 0) {
                try {
                    Cache::put($cacheKey, $result, $cacheTtl);
                } catch (QueryException) {
                    // A cache write failure must not hide a valid live offer response.
                }
            }
        }

        return $result;
    }

    /** @param array<string, mixed> $query
     * @param  array<string, mixed>  $input
     */
    private function applySupportedDestinationFilter(array &$query, array $input): bool
    {
        $propertyId = $input['propertyId'] ?? null;
        if (is_string($propertyId) && preg_match('/^PAR-([1-9]\d{0,8})-([1-9]\d{0,11})$/D', $propertyId, $matches) === 1) {
            $query['propertyId'] = 'imobsys-crcn-'.$matches[1].'-'.$matches[2];

            return $this->isCaldasNovasSearch($input['cities'] ?? []);
        }

        if (is_string($propertyId) && preg_match('/^condo-[A-Za-z0-9_-]{1,80}$/D', $propertyId) === 1) {
            $query['condominiumId'] = $propertyId;

            return $this->isCaldasNovasSearch($input['cities'] ?? []);
        }

        $properties = null;
        if (is_string($propertyId) && $propertyId !== '') {
            $properties = $this->catalog->all();
            if (! is_array($properties)) {
                return false;
            }
            $isPartnerCondominium = collect($properties)->contains(fn (array $property): bool => ($property['partnerCondominiumId'] ?? null) === $propertyId);
            if (! $isPartnerCondominium) {
                return false;
            }
            $query['condominiumId'] = $propertyId;
        } elseif (is_string($input['destination'] ?? null) && trim($input['destination']) !== '') {
            $properties = $this->catalog->all();
            if (! is_array($properties)) {
                return false;
            }
            $destination = mb_strtolower(trim($input['destination']));
            $condominiumIds = collect($properties)
                ->filter(fn (array $property): bool => str_contains(mb_strtolower((string) ($property['complexName'] ?? '')), $destination))
                ->pluck('partnerCondominiumId')->filter(fn (mixed $id): bool => is_string($id) && $id !== '')
                ->unique()->values();
            if ($condominiumIds->count() !== 1) {
                return false;
            }
            $query['condominiumId'] = $condominiumIds->first();
        }

        return $this->isCaldasNovasSearch($input['cities'] ?? []);
    }

    /** @param list<string> $cities */
    private function isCaldasNovasSearch(array $cities): bool
    {
        if ($cities === []) {
            return true;
        }

        return count($cities) === 1 && mb_strtolower(trim($cities[0])) === 'caldas novas';
    }

    /** @param array<string, mixed> $payload
     * @param  array<string, mixed>  $query
     */
    private function matchesQuery(array $payload, array $query): bool
    {
        $observedAt = is_string($payload['observedAt'] ?? null) ? strtotime($payload['observedAt']) : false;
        $expiresAt = is_string($payload['expiresAt'] ?? null) ? strtotime($payload['expiresAt']) : false;

        return ($payload['success'] ?? null) === true
            && ($payload['source'] ?? null) === 'imobsys-live'
            && ($payload['from'] ?? null) === $query['from']
            && ($payload['to'] ?? null) === $query['to']
            && ($payload['guests'] ?? null) === $query['guests']
            && is_int($observedAt) && $observedAt <= now()->timestamp + 5
            && is_int($expiresAt) && $expiresAt > now()->timestamp
            && is_array($payload['offers'] ?? null) && array_is_list($payload['offers'])
            && is_array($payload['pagination'] ?? null)
            && ($payload['catalogueComplete'] ?? null) === false
            && ($payload['absenceMeans'] ?? null) === 'unknown'
            && ($payload['guestCountVerified'] ?? null) === false
            && ($payload['guestCompositionVerified'] ?? null) === false
            && ($payload['childPricingVerified'] ?? null) === false
            && ($payload['bookingEnabled'] ?? null) === false
            && ($payload['paymentEnabled'] ?? null) === false;
    }
}
