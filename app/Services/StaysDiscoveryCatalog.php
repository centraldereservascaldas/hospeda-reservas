<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Sleep;
use RuntimeException;

class StaysDiscoveryCatalog
{
    private const KEY = 'stays.public-discovery.v1';

    private float $deadline = 0;

    public function __construct(private StaysExternalApiClient $stays, private StaysPublicContentMapper $mapper) {}

    /** @return array{syncedAt: string, properties: array, listings: array}|null */
    public function snapshot(): ?array
    {
        $value = Cache::get($this->key());

        return is_array($value) ? $value : null;
    }

    public function key(): string
    {
        return self::KEY.'.'.hash('sha256', (string) config('services.stays.base_url').'|'.(string) config('services.stays.client_id'));
    }

    /** @return array{syncedAt: string, properties: array, listings: array} */
    public function sync(): array
    {
        return Cache::lock($this->key().':lock', 3600)->block(1, function (): array {
            $this->deadline = microtime(true) + 900;
            if (! $this->stays->isConfigured()) {
                throw new RuntimeException('Integração Stays não configurada.');
            }
            $rawProperties = $this->pages('/content/properties');
            $rawListings = $this->pages('/content/listings');
            $dictionary = [];
            foreach (['listing', 'property'] as $kind) {
                $terms = $this->read('/translation/'.$kind.'-amenities');
                if ($terms === null || ! array_is_list($terms)) {
                    throw new RuntimeException('Não foi possível ler as comodidades.');
                }
                foreach ($terms as $term) {
                    if (is_array($term) && is_string($term['_id'] ?? null)) {
                        $dictionary[$term['_id']] = $this->mapper->text($term['_mstitle'] ?? null);
                    }
                }
            }
            $properties = [];
            foreach ($rawProperties as $raw) {
                if (($raw['status'] ?? null) !== 'active') {
                    continue;
                }
                $detail = $this->detail('/content/properties/', $raw);
                $property = $this->mapper->map($detail, $dictionary, false);
                if ($property !== null) {
                    $property['listingIds'] = [];
                    $properties[$property['id']] = $property;
                }
            }
            $listings = [];
            foreach ($rawListings as $raw) {
                if (($raw['status'] ?? null) !== 'active') {
                    continue;
                }
                $listing = $this->mapper->map($this->detail('/content/listings/', $raw), $dictionary, true);
                if ($listing !== null) {
                    $listings[$listing['id']] = $listing;
                    if (isset($properties[$listing['propertyId']])) {
                        $properties[$listing['propertyId']]['listingIds'][] = $listing['id'];
                    }
                }
            }
            foreach ($properties as &$property) {
                $property['indexable'] = $property['indexable'] && $property['listingIds'] !== [];
            }
            unset($property);
            ksort($properties);
            ksort($listings);
            $properties = $this->assignPropertySlugs($properties);
            $snapshot = ['syncedAt' => now()->toIso8601String(), 'properties' => $properties, 'listings' => $listings];
            Cache::put($this->key(), $snapshot, 86400);

            return $snapshot;
        });
    }

    /** @return array<int, array<string, mixed>> */
    private function pages(string $endpoint): array
    {
        $items = [];
        for ($skip = 0; $skip < 5000; $skip += 100) {
            $this->assertWithinBudget();
            $batch = $this->read($endpoint, ['status' => 'active', 'limit' => 100, 'skip' => $skip]);
            if (! is_array($batch) || ! array_is_list($batch) || array_filter($batch, 'is_array') !== $batch) {
                throw new RuntimeException('Catálogo de empreendimentos incompleto.');
            }
            $items = [...$items, ...$batch];
            if (count($batch) < 100) {
                return $items;
            }
        }
        throw new RuntimeException('Limite de paginação atingido.');
    }

    /** @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    private function detail(string $endpoint, array $raw): array
    {
        $this->assertWithinBudget();
        $id = $this->mapper->identifier($raw['_id'] ?? $raw['id'] ?? null);
        $detail = $id !== '' ? $this->read($endpoint.rawurlencode($id)) : null;
        if (! is_array($detail) || array_is_list($detail)
            || ($detail['_id'] ?? null) !== ($raw['_id'] ?? null)) {
            throw new RuntimeException('Detalhe Stays indisponível ou inconsistente.');
        }

        return $detail;
    }

    /** @param array<string, mixed> $query
     * @return array<mixed>|null
     */
    private function read(string $endpoint, array $query = []): ?array
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $this->assertWithinBudget();
            $response = $this->stays->request('GET', $endpoint, $query);
            if ($response?->successful()) {
                return is_array($response->json()) ? $response->json() : null;
            }
            if ($attempt === 1 || ($response !== null && ! $response->serverError() && $response->status() !== 429)) {
                return null;
            }
            $retryAfter = $response?->header('Retry-After');
            if ($response?->status() === 429) {
                if ($retryAfter === null || ! ctype_digit($retryAfter) || (int) $retryAfter > 2) {
                    return null;
                }
                Sleep::for((int) $retryAfter)->seconds();
            } else {
                Sleep::for(200)->milliseconds();
            }
        }

        return null;
    }

    private function assertWithinBudget(): void
    {
        if (microtime(true) > $this->deadline) {
            throw new RuntimeException('Tempo limite da sincronização atingido.');
        }
    }

    /** @return array<string, mixed>|null */
    public function listing(string $id): ?array
    {
        $snapshot = $this->snapshot();
        if (isset($snapshot['listings'][$id])) {
            return $snapshot['listings'][$id];
        }
        foreach ($snapshot['listings'] ?? [] as $listing) {
            if ($listing['objectId'] === $id) {
                return $listing;
            }
        }

        return null;
    }

    /** @param array<string, mixed> $listing */
    public function listingPath(array $listing): string
    {
        return '/apartamento/'.rawurlencode($listing['id']).'/'.rawurlencode($listing['slug']);
    }

    /** @param array<string, mixed> $property */
    public function propertyPath(array $property): string
    {
        return route('condominiums.show', ['id' => $property['canonicalSlug'] ?? $property['slug']], absolute: false);
    }

    /** @param array<string, array<string, mixed>> $properties
     * @return array<string, array<string, mixed>>
     */
    private function assignPropertySlugs(array $properties): array
    {
        $account = hash('sha256', (string) config('services.stays.base_url').'|'.(string) config('services.stays.client_id'));

        return DB::transaction(function () use ($properties, $account): array {
            $rows = DB::table('condominium_slug_registry')->where('account_key', $account)->get();
            $used = [];
            $byProperty = [];
            foreach ($rows as $row) {
                $used[$row->slug] = $row->property_id;
                $byProperty[$row->property_id][] = $row;
            }
            $codes = [];
            foreach ($properties as $property) {
                $codes[strtolower($property['id'])] = $property['id'];
                if (($property['shortId'] ?? '') !== '') {
                    $codes[strtolower($property['shortId'])] = $property['id'];
                }
            }
            foreach ($properties as &$property) {
                $aliases = $byProperty[$property['id']] ?? [];
                $canonical = collect($aliases)->first(fn ($row): bool => (bool) $row->canonical);
                if ($canonical === null) {
                    $slug = substr($property['slug'], 0, 100);
                    if ((isset($used[$slug]) && $used[$slug] !== $property['id']) || (isset($codes[$slug]) && $codes[$slug] !== $property['id'])) {
                        $slug .= '-'.strtolower(($property['shortId'] ?? '') ?: $property['id']);
                    }
                    if (isset($used[$slug]) && $used[$slug] !== $property['id']) {
                        $slug .= '-'.strtolower($property['id']);
                    }
                    DB::table('condominium_slug_registry')->insert(['account_key' => $account, 'property_id' => $property['id'], 'slug' => $slug, 'canonical' => true, 'created_at' => now(), 'updated_at' => now()]);
                    $used[$slug] = $property['id'];
                    $property['canonicalSlug'] = $slug;
                    $property['aliases'] = [];
                } else {
                    $property['canonicalSlug'] = $canonical->slug;
                    $property['aliases'] = array_values(array_map(fn ($row): string => $row->slug, $aliases));
                }
            }
            unset($property);

            return $properties;
        });
    }
}
