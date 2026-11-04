<?php

namespace App\Services;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

class StaysOfferWarmup
{
    public function __construct(private readonly StaysSearchAvailabilityService $search, private readonly StaysExternalApiClient $stays) {}

    public function enabled(): bool
    {
        return (bool) config('services.stays.offer_warmup_enabled', false)
            && (int) config('services.stays.offer_warmup_daily_requests', 0) > 0
            && $this->stays->isConfigured();
    }

    public function key(): string
    {
        return 'stays.search.warmup.v1:'.hash('sha256', json_encode([
            config('services.stays.base_url'), config('services.stays.client_id'),
        ], JSON_THROW_ON_ERROR));
    }

    public function cache(): Repository
    {
        return Cache::store((string) config('services.stays.search_cache_store', 'database'));
    }

    /** @param array<string, mixed> $input */
    public function remember(array $input): void
    {
        if (! $this->enabled() || ($input['purpose'] ?? null) !== 'discovery'
            || ! empty($input['propertyId']) || ! empty($input['destination']) || ! empty($input['cities'])
            || (int) ($input['skip'] ?? 0) !== 0 || ! in_array((int) ($input['limit'] ?? 20), [8, 20], true)
            || (int) ($input['guests'] ?? 1) > 10) {
            return;
        }
        $from = $input['from'] ?? '';
        $to = $input['to'] ?? '';
        if (! is_string($from) || ! is_string($to) || $from < now()->toDateString()
            || $to <= $from || $to > now()->addYear()->toDateString()
            || (strtotime($to) - strtotime($from)) > 14 * 86400) {
            return;
        }
        $context = ['from' => $from, 'to' => $to, 'guests' => (int) ($input['guests'] ?? 1), 'limit' => (int) ($input['limit'] ?? 20), 'skip' => 0];
        try {
            $this->cache()->lock($this->key().':registry-lock', 5)->block(1, function () use ($context): void {
                $registry = $this->activeContexts();
                $id = hash('sha256', json_encode($context, JSON_THROW_ON_ERROR));
                $lastWarmed = $registry[$id]['warmedAt'] ?? 0;
                unset($registry[$id]);
                $registry[$id] = ['input' => $context, 'seenAt' => now()->timestamp, 'warmedAt' => $lastWarmed];
                $this->cache()->put($this->key().':contexts', array_slice($registry, -4, null, true), 120);
            });
        } catch (QueryException|LockTimeoutException) {
            report(new RuntimeException('Offer warmup demand could not be recorded.'));
        }
    }

    /** @return array{requests: int, outcome: string} */
    public function warmOne(): array
    {
        if (! $this->enabled()) {
            return ['requests' => 0, 'outcome' => 'disabled'];
        }
        try {
            return $this->cache()->lock($this->key().':worker-lock', 50)->block(1, function (): array {
                $selected = $this->cache()->lock($this->key().':registry-lock', 5)->block(1, function (): ?array {
                    $registry = $this->activeContexts();
                    uasort($registry, static fn (array $a, array $b): int => $a['warmedAt'] <=> $b['warmedAt']);
                    $id = array_key_first($registry);
                    if ($id === null || $registry[$id]['warmedAt'] > now()->timestamp - 45) {
                        return null;
                    }
                    $registry[$id]['warmedAt'] = now()->timestamp;
                    $this->cache()->put($this->key().':contexts', $registry, 120);

                    return $registry[$id]['input'];
                });
                if ($selected === null) {
                    return ['requests' => 0, 'outcome' => 'idle'];
                }
                $requests = 0;
                $result = $this->search->search($selected, function () use (&$requests): bool {
                    if ($requests >= 2 || ! $this->consumeBudget()) {
                        return false;
                    }
                    $requests++;

                    return true;
                });

                return ['requests' => $requests, 'outcome' => $result !== null && $result['unquotedCount'] === 0 ? 'ready' : 'unavailable'];
            });
        } catch (QueryException|LockTimeoutException) {
            report(new RuntimeException('Offer warmup shared cache could not be accessed.'));

            return ['requests' => 0, 'outcome' => 'cache-unavailable'];
        }
    }

    private function consumeBudget(): bool
    {
        return $this->cache()->lock($this->key().':budget-lock', 5)->block(1, function (): bool {
            $key = $this->key().':budget';
            $state = $this->cache()->get($key, ['day' => '', 'count' => 0, 'recent' => []]);
            $recent = array_values(array_filter($state['recent'], static fn (int $timestamp): bool => $timestamp > now()->timestamp - 60));
            $day = $state['day'] === now()->toDateString() ? $state['count'] : 0;
            if (count($recent) >= 2 || $day >= (int) config('services.stays.offer_warmup_daily_requests', 0)) {
                return false;
            }
            // Reserve before HTTP; failures do not refund provider capacity.
            $this->cache()->put($key, [
                'day' => now()->toDateString(), 'count' => $day + 1, 'recent' => [...$recent, now()->timestamp],
            ], now()->addDay()->startOfDay()->addMinutes(2));

            return true;
        });
    }

    /** @return array<string, array{input: array{from: string, to: string, guests: int, limit: int, skip: int}, seenAt: int, warmedAt: int}> */
    private function activeContexts(): array
    {
        return array_filter($this->cache()->get($this->key().':contexts', []), static fn (array $context): bool => $context['seenAt'] > now()->timestamp - 120);
    }
}
