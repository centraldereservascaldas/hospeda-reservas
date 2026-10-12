<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
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

        $payload = $this->get('/finance/owners', ['from' => now()->subYears(10)->startOfYear()->toDateString(), 'to' => now()->toDateString()]);
        $owners = $payload['owners'] ?? $payload['data'] ?? $payload;
        if (! is_array($owners)) {
            return null;
        }

        $this->cachedOwnerDirectory = collect($owners)->map(fn (array $owner): array => [
            'id' => (string) ($owner['_id'] ?? $owner['id'] ?? ''),
            'name' => (string) ($owner['name'] ?? trim(($owner['fName'] ?? '').' '.($owner['lName'] ?? ''))),
        ])->filter(fn (array $owner): bool => $owner['id'] !== '')->values()->all();
        $this->ownerDirectoryCacheUntil = time() + 300;

        return $this->cachedOwnerDirectory;
    }
}
