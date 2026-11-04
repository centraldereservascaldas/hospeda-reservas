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
        $key = 'stays.calendar.v2:'.hash('sha256', json_encode([
            config('services.stays.base_url'), config('services.stays.client_id'), $listingId, $from, $to, Cache::get($this->generationKey($listingId), 'initial'),
        ], JSON_THROW_ON_ERROR));
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }

        try {
            return Cache::lock($key.':lock', max(15, (int) config('services.stays.timeout', 10) + 5))
                ->block(3, fn (): array => Cache::remember($key, $ttl, function () use ($listingId, $from, $to, $ttl): array {
                    $days = $this->stays->get('/calendar/listing/'.rawurlencode($listingId), ['from' => $from, 'to' => $to, 'availNoPrices' => 'true', 'includeBlockedCount' => 'true']);
                    if (! is_array($days) || ! array_is_list($days)) {
                        throw new RuntimeException('Calendar unavailable.');
                    }
                    foreach ($days as $day) {
                        if (! is_array($day) || ! is_string($day['date'] ?? null)
                            || ! preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $day['date'])
                            || ! is_numeric($day['avail'] ?? null) || ! is_finite((float) $day['avail'])
                            || (array_key_exists('prices', $day) && ! $this->validPrices($day['prices']))
                            || (isset($day['closedToArrival']) && ! is_bool($day['closedToArrival']))
                            || (isset($day['closedToDeparture']) && ! is_bool($day['closedToDeparture']))) {
                            throw new RuntimeException('Invalid calendar response.');
                        }
                    }

                    $days = array_map($this->normalizeDay(...), $days);

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

    private function validPrices(mixed $prices): bool
    {
        if (! is_array($prices) || ! array_is_list($prices)) {
            return false;
        }
        foreach ($prices as $price) {
            if (! is_array($price)) {
                return false;
            }
            if (array_key_exists('minStay', $price)
                && ((! is_int($price['minStay']) && ! is_float($price['minStay'])) || ! is_finite((float) $price['minStay'])
                    || (float) $price['minStay'] < 0 || floor((float) $price['minStay']) !== (float) $price['minStay'])) {
                return false;
            }
            if (array_key_exists('_mcval', $price)) {
                if (! is_array($price['_mcval'])) {
                    return false;
                }
                foreach ($price['_mcval'] as $amount) {
                    if ((! is_int($amount) && ! is_float($amount)) || ! is_finite((float) $amount)) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $day
     * @return array<string, mixed>
     */
    private function normalizeDay(array $day): array
    {
        $hasPriceData = array_key_exists('prices', $day) && is_array($day['prices']);
        $hasSellablePrice = false;
        foreach ($hasPriceData ? $day['prices'] : [] as $price) {
            $amount = is_array($price) && is_array($price['_mcval'] ?? null) ? ($price['_mcval']['BRL'] ?? null) : null;
            if ((is_int($amount) || is_float($amount)) && is_finite((float) $amount) && $amount > 0) {
                $hasSellablePrice = true;
                break;
            }
        }

        $hasInventory = (float) $day['avail'] > 0;
        $day['availabilityStatus'] = $hasSellablePrice
            ? ($hasInventory ? 'available' : 'unavailable')
            : ($hasInventory ? 'unpriced' : 'unconfirmed');
        if (! $hasSellablePrice) {
            $day['avail'] = 0;
        }

        return $day;
    }

    public function invalidate(string $listingId): void
    {
        Cache::forever($this->generationKey($listingId), (string) Str::uuid());
        app(StaysSearchAvailabilityService::class)->invalidate();
    }

    private function generationKey(string $listingId): string
    {
        return 'stays.calendar.generation:'.hash('sha256', json_encode([
            config('services.stays.base_url'), config('services.stays.client_id'), $listingId,
        ], JSON_THROW_ON_ERROR));
    }
}
