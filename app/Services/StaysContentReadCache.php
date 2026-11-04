<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;
use RuntimeException;

class StaysContentReadCache
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    /**
     * @param  array<string, int|string>  $query
     * @return list<array<string, mixed>>|null
     */
    public function get(string $endpoint, array $query = [], ?int $timeout = null, bool $forceRefresh = false): ?array
    {
        if (! in_array($endpoint, ['/content/properties', '/translation/listing-amenities', '/translation/property-amenities'], true)) {
            throw new InvalidArgumentException('Only public accommodation metadata lists may use this cache.');
        }
        ksort($query);
        $key = 'stays.content-list.v1:'.hash('sha256', json_encode([$this->account(), $endpoint, $query], JSON_THROW_ON_ERROR));
        try {
            $cached = $this->cache()->get($key);
            if (is_array($cached) && ! $forceRefresh) {
                return $cached;
            }
            $this->assertAvailable();

            return $this->cache()->lock($key.':lock', max(15, ($timeout ?? (int) config('services.stays.timeout', 10)) + 5))->block(1, function () use ($key, $endpoint, $query, $timeout, $forceRefresh): ?array {
                $cached = $this->cache()->get($key);
                if (is_array($cached) && ! $forceRefresh) {
                    return $cached;
                }
                $this->assertAvailable();
                $response = $this->stays->request('GET', $endpoint, $query, timeout: $timeout);
                if ($response?->status() === 429) {
                    $limited = StaysContentRateLimited::fromHeader($response->header('Retry-After'));
                    $this->pause($limited);
                    throw $limited;
                }
                $data = $response?->successful() ? $response->json() : null;
                if (! is_array($data) || ! array_is_list($data) || array_filter($data, 'is_array') !== $data) {
                    return null;
                }
                foreach ($data as $row) {
                    $id = $row['_id'] ?? $row['id'] ?? null;
                    $title = $row['_mstitle'] ?? null;
                    if (! is_string($id) || trim($id) === ''
                        || ($title !== null && ! is_string($title) && (! is_array($title) || array_filter($title, 'is_string') !== $title))
                        || (isset($row['name']) && ! is_string($row['name']))
                        || (isset($row['internalName']) && ! is_string($row['internalName']))
                        || (isset($row['amenities']) && ! is_array($row['amenities']))) {
                        return null;
                    }
                }
                $fields = $endpoint === '/content/properties'
                    ? ['_id', 'id', '_mstitle', 'internalName', 'amenities']
                    : ['_id', 'name', '_mstitle'];
                $allowed = array_fill_keys($fields, true);
                $data = array_map(static fn (array $row): array => array_intersect_key($row, $allowed), $data);
                $this->cache()->put($key, $data, 300);

                return $data;
            });
        } catch (QueryException|LockTimeoutException $exception) {
            if ($exception instanceof QueryException) {
                report(new RuntimeException('The shared accommodation metadata cache could not be accessed.'));
            }

            return null;
        }
    }

    public function remainingCooldown(): int
    {
        $until = $this->cache()->get($this->cooldownKey());

        return is_int($until) ? max(0, $until - now()->timestamp) : 0;
    }

    public function assertAvailable(): void
    {
        $remaining = $this->remainingCooldown();
        if ($remaining > 0) {
            throw new StaysContentRateLimited($remaining);
        }
    }

    public function pause(StaysContentRateLimited $limited): void
    {
        try {
            $this->cache()->lock($this->cooldownKey().':lock', 3)->block(1, function () use ($limited): void {
                $seconds = max($limited->retryAfterSeconds, $this->remainingCooldown());
                $this->cache()->put($this->cooldownKey(), now()->timestamp + $seconds, $seconds);
            });
        } catch (LockTimeoutException) {
            $this->cache()->add($this->cooldownKey(), now()->timestamp + $limited->retryAfterSeconds, $limited->retryAfterSeconds);
        }
    }

    private function cooldownKey(): string
    {
        return 'stays.content-list.cooldown:'.hash('sha256', json_encode($this->account(), JSON_THROW_ON_ERROR));
    }

    private function cache(): Repository
    {
        return Cache::store((string) config('services.stays.content_cache_store', 'database'));
    }

    /** @return array{string, string} */
    private function account(): array
    {
        return [(string) config('services.stays.base_url'), (string) config('services.stays.client_id')];
    }
}
