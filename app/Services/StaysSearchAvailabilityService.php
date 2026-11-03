<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class StaysSearchAvailabilityService
{
    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysSearchQuoteService $quotes) {}

    /**
     * @param  array{from: string, to: string, guests?: int, propertyId?: string, cities?: list<string>, destination?: string, limit?: int, skip?: int}  $input
     * @return array{items: list<array<string, mixed>>, unquotedCount: int, receivedCount: int, meta: array{fetchedAt: string, expiresAt: string}}|null
     */
    public function search(array $input): ?array
    {
        $cities = array_values(array_unique($input['cities'] ?? []));
        sort($cities, SORT_STRING);
        $context = [
            'from' => $input['from'], 'to' => $input['to'], 'guests' => (int) ($input['guests'] ?? 1),
            'properties' => isset($input['propertyId']) ? [$input['propertyId']] : null,
            'cities' => $cities === [] ? null : $cities, 'limit' => (int) ($input['limit'] ?? 20), 'skip' => (int) ($input['skip'] ?? 0),
        ];
        $key = 'stays.search.v1:'.hash('sha256', json_encode([
            $this->account(), Cache::get($this->generationKey(), 'initial'), $context, $input['destination'] ?? '', 'BRL',
        ], JSON_THROW_ON_ERROR));
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }
        try {
            return Cache::lock($key.':lock', max(30, (int) config('services.stays.timeout', 10) + 15))->block(3, function () use ($key, $context): ?array {
                $cached = Cache::get($key);
                if (is_array($cached)) {
                    return $cached;
                }
                $fetchedAt = now();
                $expiresAt = $fetchedAt->copy()->addSeconds(max(1, min(60, (int) config('services.stays.search_cache_ttl', 45))));
                $live = $this->stays->post('/booking/search-listings', array_filter([
                    ...$context, 'isBookable' => true,
                ], static fn (mixed $value): bool => $value !== null));
                if (! is_array($live) || ! array_is_list($live) || array_filter($live, 'is_array') !== $live || count($live) > $context['limit']) {
                    return null;
                }
                $resolved = $this->quotes->resolve($live, $context['from'], $context['to'], $context['guests']);
                $result = [...$resolved, 'receivedCount' => count($live), 'meta' => [
                    'fetchedAt' => $fetchedAt->toIso8601String(), 'expiresAt' => $expiresAt->toIso8601String(),
                ]];
                if ($resolved['unquotedCount'] === 0 && $expiresAt->isFuture()) {
                    Cache::put($key, $result, $expiresAt);
                }

                return $result;
            });
        } catch (LockTimeoutException) {
            return null;
        }
    }

    public function invalidate(): void
    {
        Cache::forever($this->generationKey(), (string) Str::uuid());
    }

    private function generationKey(): string
    {
        return 'stays.search.generation:'.hash('sha256', json_encode($this->account(), JSON_THROW_ON_ERROR));
    }

    /** @return array{string, string} */
    private function account(): array
    {
        return [(string) config('services.stays.base_url'), (string) config('services.stays.client_id')];
    }
}
