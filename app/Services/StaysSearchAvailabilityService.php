<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use RuntimeException;

class StaysSearchAvailabilityService
{
    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysSearchQuoteService $quotes) {}

    /**
     * @param  array{from: string, to: string, guests?: int, propertyId?: string, cities?: list<string>, destination?: string, limit?: int, skip?: int}  $input
     * @return array{items: list<array<string, mixed>>, unquotedCount: int, receivedCount: int, meta: array{fetchedAt: string, expiresAt: string}}|null
     */
    public function search(array $input): ?array
    {
        try {
            $cities = array_values(array_unique($input['cities'] ?? []));
            sort($cities, SORT_STRING);
            $context = [
                'from' => $input['from'], 'to' => $input['to'], 'guests' => (int) ($input['guests'] ?? 1),
                'properties' => isset($input['propertyId']) ? [$input['propertyId']] : null,
                'cities' => $cities === [] ? null : $cities, 'limit' => (int) ($input['limit'] ?? 20), 'skip' => (int) ($input['skip'] ?? 0),
            ];
            $key = 'stays.search.v1:'.hash('sha256', json_encode([
                $this->account(), $this->cache()->get($this->generationKey(), 'initial'), $context, $input['destination'] ?? '', 'BRL',
            ], JSON_THROW_ON_ERROR));
            $cached = $this->cache()->get($key);
            if (is_array($cached)) {
                return $cached;
            }

            return $this->cache()->lock($key.':lock', max(30, (int) config('services.stays.timeout', 10) + 15))->block(3, function () use ($key, $context): ?array {
                $cached = $this->cache()->get($key);
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
                    $this->cache()->put($key, $result, $expiresAt);
                }

                return $result;
            });
        } catch (QueryException|LockTimeoutException $exception) {
            if ($exception instanceof QueryException) {
                report(new RuntimeException('The shared search cache could not be accessed.'));
            }

            return null;
        }
    }

    public function invalidate(): void
    {
        try {
            $this->cache()->forever($this->generationKey(), (string) Str::uuid());
        } catch (QueryException $exception) {
            report(new RuntimeException('The shared search cache could not be invalidated.'));
        }
    }

    private function cache(): Repository
    {
        return Cache::store((string) config('services.stays.search_cache_store', 'database'));
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
