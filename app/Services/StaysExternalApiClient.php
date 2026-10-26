<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class StaysExternalApiClient
{
    private ?array $cachedOwnerDirectory = null;

    private int $ownerDirectoryCacheUntil = 0;

    public function isConfigured(): bool
    {
        return (string) config('services.stays.client_id') !== ''
            && (string) config('services.stays.client_secret') !== '';
    }

    public function request(string $method, string $endpoint, array $query = [], ?array $payload = null): ?Response
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $baseUrl = rtrim((string) config('services.stays.base_url'), '/');
        if (! preg_match('~/external/v1$~i', $baseUrl)) {
            $baseUrl .= '/external/v1';
        }

        $url = $baseUrl.'/'.ltrim($endpoint, '/');

        try {
            $request = Http::acceptJson()
                ->asJson()
                ->withBasicAuth(
                    (string) config('services.stays.client_id'),
                    (string) config('services.stays.client_secret'),
                )
                ->connectTimeout(3)
                ->timeout((int) config('services.stays.timeout', 10));

            return $request->send(strtoupper($method), $url, [
                'query' => $query,
                ...($payload === null ? [] : ['json' => $payload]),
            ]);
        } catch (ConnectionException) {
            return null;
        }
    }

    public function get(string $endpoint, array $query = []): ?array
    {
        $response = $this->request('GET', $endpoint, $query);

        return $response?->successful() && is_array($response->json()) ? $response->json() : null;
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    public function activeListings(): ?array
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $listings = [];
        for ($page = 0; $page < 100; $page++) {
            $batch = $this->get('/content/listings', [
                'limit' => 50,
                'skip' => $page * 50,
                'status' => 'active',
            ]);
            if (! is_array($batch)
                || ! array_is_list($batch)
                || array_filter($batch, static fn (mixed $listing): bool => is_array($listing)) !== $batch) {
                return null;
            }

            $listings = [...$listings, ...$batch];
            if (count($batch) < 50) {
                return $listings;
            }
        }

        return null;
    }

    public function post(string $endpoint, array $payload): ?array
    {
        $response = $this->request('POST', $endpoint, payload: $payload);

        return $response?->successful() && is_array($response->json()) ? $response->json() : null;
    }

    /**
     * @return array{
     *     owner: array<string, mixed>|null,
     *     reason: 'owner_not_found'|'unavailable'|null
     * }
     */
    public function ownerFinance(string $ownerId, string $from, string $to): array
    {
        $payload = $this->get('/finance/owners', ['from' => $from, 'to' => $to]);
        if (! is_array($payload)) {
            return ['owner' => null, 'reason' => 'unavailable'];
        }

        $owners = $payload['owners'] ?? $payload['ownerList'] ?? $payload['results'] ?? $payload['data'] ?? $payload;
        if (is_array($owners) && ! array_is_list($owners)) {
            $owners = $owners['owners'] ?? $owners['ownerList'] ?? $owners['results'] ?? null;
        }
        if (! is_array($owners) || ! array_is_list($owners)) {
            return ['owner' => null, 'reason' => 'unavailable'];
        }

        $owner = null;
        foreach ($owners as $candidate) {
            if (is_array($candidate) && (string) ($candidate['_id'] ?? $candidate['id'] ?? $candidate['ownerId'] ?? '') === $ownerId) {
                $owner = $candidate;
                break;
            }
        }
        if (! is_array($owner)) {
            return ['owner' => null, 'reason' => 'owner_not_found'];
        }
        if (! is_array($owner['listings'] ?? null) || count($owner['listings']) > 200) {
            return ['owner' => null, 'reason' => 'unavailable'];
        }

        $listings = [];
        foreach ($owner['listings'] as $summary) {
            if (! is_array($summary)) {
                return ['owner' => null, 'reason' => 'unavailable'];
            }
            $listingIds = array_values(array_unique(array_filter(array_map(
                static fn (mixed $value): string => is_scalar($value) ? (string) $value : '',
                [$summary['_id'] ?? null, $summary['id'] ?? null, $summary['code'] ?? null],
            ))));
            if ($listingIds === []) {
                return ['owner' => null, 'reason' => 'unavailable'];
            }

            $detail = null;
            foreach ($listingIds as $listingId) {
                $detail = $this->get('/finance/owners/'.rawurlencode($ownerId).'/'.rawurlencode($listingId), ['from' => $from, 'to' => $to]);
                if (is_array($detail)) {
                    break;
                }
            }
            if (! is_array($detail)) {
                return ['owner' => null, 'reason' => 'unavailable'];
            }
            $detail = $detail['listing'] ?? $detail['data'] ?? $detail;
            if (! is_array($detail)) {
                return ['owner' => null, 'reason' => 'unavailable'];
            }
            if (is_array($detail['listings'] ?? null)) {
                $detail = $detail['listings'][0] ?? null;
                if (! is_array($detail)) {
                    return ['owner' => null, 'reason' => 'unavailable'];
                }
            }

            $listings[] = array_replace($summary, $detail);
        }

        $owner['listings'] = $listings;

        return ['owner' => $owner, 'reason' => null];
    }

    /** @return array<int, array<string, mixed>>|null */
    public function ownerDirectory(): ?array
    {
        if ($this->cachedOwnerDirectory !== null && $this->ownerDirectoryCacheUntil > time()) {
            return $this->cachedOwnerDirectory;
        }

        $this->cachedOwnerDirectory = Cache::remember('stays.owner_directory.v1', 300, function (): ?array {
            $ownersById = [];
            $today = now()->startOfDay();
            $from = now()->subYears(10)->startOfYear();

            while ($from->lte($today)) {
                // Stays rejects finance queries spanning more than one year.
                $to = $from->copy()->addDays(364);
                if ($to->gt($today)) {
                    $to = $today->copy();
                }

                $payload = $this->get('/finance/owners', [
                    'from' => $from->toDateString(),
                    'to' => $to->toDateString(),
                ]);
                if (! is_array($payload)) {
                    return null;
                }

                $owners = $payload['owners'] ?? $payload['data'] ?? $payload;
                if (! is_array($owners) || ! array_is_list($owners)) {
                    return null;
                }

                foreach ($owners as $owner) {
                    if (! is_array($owner)) {
                        continue;
                    }

                    $id = (string) ($owner['_id'] ?? $owner['id'] ?? '');
                    if ($id === '') {
                        continue;
                    }

                    $name = (string) ($owner['name'] ?? trim(($owner['fName'] ?? '').' '.($owner['lName'] ?? '')));
                    $ownersById[$id] = ['id' => $id, 'name' => $name];
                }

                $from = $to->copy()->addDay();
            }

            return array_values($ownersById);
        });
        $this->ownerDirectoryCacheUntil = time() + 300;

        return $this->cachedOwnerDirectory;
    }
}
