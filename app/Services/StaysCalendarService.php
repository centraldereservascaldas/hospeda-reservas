<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use RuntimeException;

class StaysCalendarService
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    /** @return array{data: array<int, array<string, mixed>>, meta: array<string, mixed>}|null */
    public function get(string $listingId, string $from, string $to): ?array
    {
        $ttl = max(1, (int) config('services.stays.calendar_cache_ttl', 45));
        $key = 'stays.calendar.v1:'.hash('sha256', json_encode([
            config('services.stays.base_url'), config('services.stays.client_id'), $listingId, $from, $to, Cache::get($this->generationKey($listingId), 'initial'),
        ], JSON_THROW_ON_ERROR));
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }

        try {
            return Cache::lock($key.':lock', max(15, (int) config('services.stays.timeout', 10) + 5))
                ->block(3, fn (): array => Cache::remember($key, $ttl, function () use ($listingId, $from, $to, $ttl): array {
                    $days = $this->stays->get('/calendar/listing/'.rawurlencode($listingId), ['from' => $from, 'to' => $to]);
                    if (! is_array($days) || ! array_is_list($days)) {
                        throw new RuntimeException('Calendar unavailable.');
                    }
                    foreach ($days as $day) {
                        if (! is_array($day) || ! is_string($day['date'] ?? null)
                            || ! preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $day['date'])
                            || ! is_numeric($day['avail'] ?? null) || ! is_finite((float) $day['avail'])
                            || (isset($day['closedToArrival']) && ! is_bool($day['closedToArrival']))
                            || (isset($day['closedToDeparture']) && ! is_bool($day['closedToDeparture']))) {
                            throw new RuntimeException('Invalid calendar response.');
                        }
                    }

                    $fetchedAt = now();

                    return ['data' => $days, 'meta' => [
                        'fetchedAt' => $fetchedAt->toIso8601String(),
                        'expiresAt' => $fetchedAt->copy()->addSeconds($ttl)->toIso8601String(),
                        'requestedFrom' => $from, 'requestedTo' => $to,
                    ]];
                }));
        } catch (RuntimeException|LockTimeoutException) {
            return null;
        }
    }

    public function invalidate(string $listingId): void
    {
        Cache::forever($this->generationKey($listingId), (string) Str::uuid());
    }

    private function generationKey(string $listingId): string
    {
        return 'stays.calendar.generation:'.hash('sha256', json_encode([
            config('services.stays.base_url'), config('services.stays.client_id'), $listingId,
        ], JSON_THROW_ON_ERROR));
    }
}
