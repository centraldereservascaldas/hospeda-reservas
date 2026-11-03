<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

class StaysAccommodationCatalog
{
    private const FRESH_SECONDS = 300;

    private const RETENTION_SECONDS = 86400;

    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysAccommodationMapper $mapper) {}

    /** @return array{success: bool, source: string, count: int, data: list<array<string, mixed>>}|null */
    public function get(): ?array
    {
        $snapshot = null;
        try {
            $snapshot = $this->cache()->get($this->key());
            if ($this->usable($snapshot) && strtotime($snapshot['refreshAfter']) > now()->timestamp) {
                return $snapshot['response'];
            }

            return $this->refresh();
        } catch (RuntimeException|LockTimeoutException) {
            return $this->usable($snapshot) ? $snapshot['response'] : null;
        }
    }

    /** @return array{success: bool, source: string, count: int, data: list<array<string, mixed>>} */
    public function refresh(): array
    {
        return $this->cache()->lock($this->key().':lock', 2100)->block(15, function (): array {
            $snapshot = $this->cache()->get($this->key());
            if ($this->usable($snapshot) && strtotime($snapshot['refreshAfter']) > now()->timestamp) {
                return $snapshot['response'];
            }
            $listings = $this->stays->activeListings();
            if ($listings === null) {
                throw new RuntimeException('The accommodation catalog could not be refreshed.');
            }
            $fallback = $this->fallback();
            $this->mapper->reset();
            $mapped = array_map(fn (array $listing): array => $this->mapper->map($listing, $fallback, requireCompleteMetadata: true), $listings);
            $fetchedAt = now();
            $response = ['success' => true, 'source' => 'stays-live', 'count' => count($mapped), 'data' => $mapped];
            $this->cache()->put($this->key(), [
                'response' => $response, 'fetchedAt' => $fetchedAt->toIso8601String(),
                'refreshAfter' => $fetchedAt->copy()->addSeconds(self::FRESH_SECONDS)->toIso8601String(),
                'expiresAt' => $fetchedAt->copy()->addSeconds(self::RETENTION_SECONDS)->toIso8601String(),
            ], self::RETENTION_SECONDS);

            return $response;
        });
    }

    public function key(): string
    {
        return 'stays.accommodation-catalog.v2:'.hash('sha256', json_encode([
            config('services.stays.base_url'), config('services.stays.client_id'),
        ], JSON_THROW_ON_ERROR));
    }

    /** @return list<array<string, mixed>> */
    public function fallback(): array
    {
        return json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    private function cache(): Repository
    {
        return Cache::store((string) config('services.stays.content_cache_store', 'database'));
    }

    private function usable(mixed $snapshot): bool
    {
        return is_array($snapshot) && is_array($snapshot['response'] ?? null)
            && is_string($snapshot['expiresAt'] ?? null) && is_string($snapshot['refreshAfter'] ?? null)
            && strtotime($snapshot['expiresAt']) > now()->timestamp;
    }
}
