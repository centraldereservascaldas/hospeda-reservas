<?php

namespace App\Services;

use App\Jobs\RefreshStaysAccommodationCatalog;
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
            if ($this->usable($snapshot)) {
                if (strtotime($snapshot['refreshAfter']) <= now()->timestamp) {
                    RefreshStaysAccommodationCatalog::dispatch($this->key());
                }

                return $snapshot['response'];
            }

            if ($this->cache()->get($this->key().':warming') === true) {
                return null;
            }

            return $this->refresh(budgetSeconds: 12);
        } catch (RuntimeException|LockTimeoutException) {
            return $this->usable($snapshot) ? $snapshot['response'] : null;
        }
    }

    /** @return array{success: bool, source: string, count: int, data: list<array<string, mixed>>} */
    public function refresh(int $budgetSeconds = 30, bool $background = false): array
    {
        if ($background) {
            $this->cache()->put($this->key().':warming', true, 60);
        }
        $response = $this->cache()->lock($this->key().':lock', 60)->block($background ? 10 : 1, function () use ($budgetSeconds): array {
            $snapshot = $this->cache()->get($this->key());
            if ($this->usable($snapshot) && strtotime($snapshot['refreshAfter']) > now()->timestamp) {
                return $snapshot['response'];
            }
            $deadline = microtime(true) + max(1, min(30, $budgetSeconds));
            $listings = $this->stays->activeListings($deadline);
            if ($listings === null || microtime(true) >= $deadline) {
                throw new RuntimeException('The accommodation catalog could not be refreshed.');
            }
            $fallback = $this->fallback();
            $this->mapper->reset();
            $mapped = [];
            foreach ($listings as $listing) {
                if (microtime(true) >= $deadline) {
                    throw new RuntimeException('The catalog refresh time budget was exceeded.');
                }
                $mapped[] = $this->mapper->map($listing, $fallback, requireCompleteMetadata: true, deadline: $deadline);
            }
            if (microtime(true) >= $deadline) {
                throw new RuntimeException('The catalog refresh time budget was exceeded.');
            }
            $fetchedAt = now();
            $response = ['success' => true, 'source' => 'stays-live', 'count' => count($mapped), 'data' => $mapped];
            $this->cache()->put($this->key(), [
                'response' => $response, 'fetchedAt' => $fetchedAt->toIso8601String(),
                'refreshAfter' => $fetchedAt->copy()->addSeconds(self::FRESH_SECONDS)->toIso8601String(),
                'expiresAt' => $fetchedAt->copy()->addSeconds(self::RETENTION_SECONDS)->toIso8601String(),
            ], self::RETENTION_SECONDS);

            return $response;
        });
        if ($background) {
            $this->cache()->forget($this->key().':warming');
        }

        return $response;
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
