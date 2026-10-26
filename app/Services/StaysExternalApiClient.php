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

    public function post(string $endpoint, array $payload): ?array
    {
        $response = $this->request('POST', $endpoint, payload: $payload);

        return $response?->successful() && is_array($response->json()) ? $response->json() : null;
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
