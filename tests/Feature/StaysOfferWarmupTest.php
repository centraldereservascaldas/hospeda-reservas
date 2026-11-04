<?php

namespace Tests\Feature;

use App\Jobs\WarmStaysOffers;
use App\Services\StaysOfferWarmup;
use App\Services\StaysSearchAvailabilityService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class StaysOfferWarmupTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 11, 3)->startOfDay());
        config([
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret',
            'services.stays.search_cache_store' => 'array', 'services.stays.content_cache_store' => 'array',
            'services.stays.offer_warmup_enabled' => true, 'services.stays.offer_warmup_daily_requests' => 20,
        ]);
        Http::preventStrayRequests();
    }

    public function test_disabled_or_zero_budget_warmup_does_not_record_or_query(): void
    {
        $warmup = app(StaysOfferWarmup::class);
        foreach ([['enabled' => false, 'budget' => 20], ['enabled' => true, 'budget' => 0]] as $settings) {
            config(['services.stays.offer_warmup_enabled' => $settings['enabled'], 'services.stays.offer_warmup_daily_requests' => $settings['budget']]);
            $warmup->remember($this->context());
            $this->assertSame(['requests' => 0, 'outcome' => 'disabled'], $warmup->warmOne());
        }
        $this->assertNull($warmup->cache()->get($warmup->key().':contexts'));
        Http::assertNothingSent();
    }

    public function test_only_recent_visible_discovery_contexts_are_warmed_and_reused_by_foreground_search(): void
    {
        Http::fake(['*' => Http::response([])]);
        $warmup = app(StaysOfferWarmup::class);
        $warmup->remember($this->context());
        Http::assertNothingSent();
        $this->assertSame(['requests' => 1, 'outcome' => 'ready'], $warmup->warmOne());
        $search = app(StaysSearchAvailabilityService::class);
        $first = $search->search($this->context());
        Http::assertSentCount(1);
        $this->travel(20)->seconds();
        $this->assertSame($first, $search->search($this->context()));
        $this->assertSame(['requests' => 0, 'outcome' => 'idle'], $warmup->warmOne());
        Http::assertSentCount(1);
        $this->travel(41)->seconds();
        $this->assertSame(['requests' => 1, 'outcome' => 'ready'], $warmup->warmOne());
        $this->assertNotSame($first['meta']['expiresAt'], $search->search($this->context())['meta']['expiresAt']);
        Http::assertSentCount(2);
        $this->travel(60)->seconds();
        $this->assertSame(['requests' => 0, 'outcome' => 'idle'], $warmup->warmOne());
        Http::assertSentCount(2);
    }

    public function test_non_discovery_filtered_paginated_or_excessive_contexts_are_not_registered(): void
    {
        $warmup = app(StaysOfferWarmup::class);
        foreach ([['purpose' => 'search'], ['propertyId' => 'one'], ['cities' => ['Caldas']], ['destination' => 'Caldas'], ['skip' => 8], ['limit' => 100], ['guests' => 50], ['from' => '2026-01-01'], ['to' => '2026-12-31']] as $override) {
            $warmup->remember([...$this->context(), ...$override]);
        }
        $this->assertSame(['requests' => 0, 'outcome' => 'idle'], $warmup->warmOne());
        Http::assertNothingSent();
        $this->postJson('/api/search', [...$this->context(), 'purpose' => 'private'])->assertUnprocessable()->assertJsonValidationErrors('purpose');
    }

    public function test_registry_and_minute_budget_are_bounded_across_instances(): void
    {
        Http::fake(['*' => Http::response([])]);
        $warmup = app(StaysOfferWarmup::class);
        for ($guests = 1; $guests <= 8; $guests++) {
            $warmup->remember([...$this->context(), 'guests' => $guests]);
        }
        $registry = $warmup->cache()->get($warmup->key().':contexts');
        $this->assertCount(4, $registry);
        $this->assertSame([5, 6, 7, 8], array_values(array_map(static fn (array $entry): int => $entry['input']['guests'], $registry)));
        for ($attempt = 0; $attempt < 4; $attempt++) {
            app(StaysOfferWarmup::class)->warmOne();
        }
        Http::assertSentCount(2);
        $this->travel(61)->seconds();
        $warmup->warmOne();
        Http::assertSentCount(3);
    }

    public function test_daily_budget_includes_failed_attempts_and_cannot_be_bypassed_by_new_contexts(): void
    {
        config(['services.stays.offer_warmup_daily_requests' => 1]);
        Http::fake(['*' => Http::response([], 503)]);
        $warmup = app(StaysOfferWarmup::class);
        $warmup->remember($this->context());
        $this->assertSame(['requests' => 1, 'outcome' => 'unavailable'], $warmup->warmOne());
        $this->travel(61)->seconds();
        $warmup->remember([...$this->context(), 'guests' => 3]);
        $this->assertSame(0, $warmup->warmOne()['requests']);
        Http::assertSentCount(1);
    }

    public function test_budget_is_checked_again_before_batch_pricing_and_partial_results_are_not_cached(): void
    {
        config(['services.stays.offer_warmup_daily_requests' => 1]);
        Http::fakeSequence()->push([['_id' => 'listing-one']])->push([]);
        $warmup = app(StaysOfferWarmup::class);
        $warmup->remember($this->context());
        $this->assertSame(['requests' => 1, 'outcome' => 'unavailable'], $warmup->warmOne());
        Http::assertSentCount(1);
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'calculate-price'));
        app(StaysSearchAvailabilityService::class)->search($this->context());
        Http::assertSentCount(2);
    }

    public function test_provider_cooldown_prevents_warmup_without_consuming_capacity(): void
    {
        Http::fake(['*' => Http::response([], 429, ['Retry-After' => '300'])]);
        $warmup = app(StaysOfferWarmup::class);
        $warmup->remember($this->context());
        $warmup->warmOne();
        $this->travel(61)->seconds();
        $warmup->remember($this->context());
        $this->assertSame(['requests' => 0, 'outcome' => 'unavailable'], $warmup->warmOne());
        Http::assertSentCount(1);
    }

    public function test_account_changes_isolate_demand_and_old_jobs_do_not_query_new_account(): void
    {
        $warmup = app(StaysOfferWarmup::class);
        $warmup->remember($this->context());
        $job = new WarmStaysOffers($warmup->key());
        config(['services.stays.client_id' => 'another-account']);
        $job->handle($warmup);
        $this->assertSame(['requests' => 0, 'outcome' => 'idle'], $warmup->warmOne());
        Http::assertNothingSent();
    }

    public function test_two_call_warmup_caches_confirmed_prices_for_the_same_foreground_context(): void
    {
        Http::fake([
            '*/booking/search-listings' => Http::response([['_id' => 'listing-one']]),
            '*/booking/calculate-price' => Http::response([['_idlisting' => 'listing-one', '_mctotal' => ['BRL' => 500], 'feesIncluded' => true, 'fees' => []]]),
        ]);
        $warmup = app(StaysOfferWarmup::class);
        $warmup->remember($this->context());
        $this->assertSame(['requests' => 2, 'outcome' => 'ready'], $warmup->warmOne());
        $result = app(StaysSearchAvailabilityService::class)->search($this->context());
        $this->assertSame(500, $result['items'][0]['calculatedPrice']['totalAmount']);
        Http::assertSentCount(2);
    }

    public function test_rolling_minute_budget_does_not_allow_a_burst_at_the_clock_minute_boundary(): void
    {
        Http::fake([
            '*/booking/search-listings' => Http::response([['_id' => 'listing-one']]),
            '*/booking/calculate-price' => Http::response([['_idlisting' => 'listing-one', '_mctotal' => ['BRL' => 500], 'feesIncluded' => true, 'fees' => []]]),
        ]);
        $warmup = app(StaysOfferWarmup::class);
        $this->travel(59)->seconds();
        $warmup->remember($this->context());
        $this->assertSame(2, $warmup->warmOne()['requests']);
        $this->travel(2)->seconds();
        $warmup->remember([...$this->context(), 'guests' => 3]);
        $this->assertSame(0, $warmup->warmOne()['requests']);
        Http::assertSentCount(2);
    }

    public function test_public_discovery_request_registers_demand_without_starting_a_background_query(): void
    {
        Http::fake(['*' => Http::response([])]);
        $warmup = app(StaysOfferWarmup::class);
        $this->postJson('/api/search', $this->context())->assertOk()->assertJsonPath('source', 'stays-live');
        $this->assertCount(1, $warmup->cache()->get($warmup->key().':contexts'));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'calculate-price'));
        $this->assertSame(['requests' => 0, 'outcome' => 'ready'], $warmup->warmOne());
    }

    public function test_unique_jobs_use_discovery_queue_and_shared_search_cache(): void
    {
        Queue::fake();
        $key = app(StaysOfferWarmup::class)->key();
        WarmStaysOffers::dispatch($key);
        WarmStaysOffers::dispatch($key);
        Queue::assertPushed(WarmStaysOffers::class, 1);
        Queue::assertPushed(WarmStaysOffers::class, fn (WarmStaysOffers $job): bool => $job->queue === 'discovery' && $job->connection === 'database');
        Http::assertNothingSent();
    }

    public function test_database_store_shares_budget_and_unique_jobs_across_recreated_connections(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'offer-warmup-');
        $suffix = bin2hex(random_bytes(6));
        $table = 'offer_cache_'.$suffix;
        $locks = 'offer_locks_'.$suffix;
        $connection = config('database.default') === 'pgsql'
            ? config('database.connections.pgsql')
            : ['driver' => 'sqlite', 'database' => $file, 'foreign_key_constraints' => true];
        config([
            'database.connections.offer_test' => $connection,
            'cache.stores.offer_test' => ['driver' => 'database', 'connection' => 'offer_test', 'lock_connection' => 'offer_test', 'table' => $table, 'lock_table' => $locks],
            'services.stays.search_cache_store' => 'offer_test',
            'services.stays.offer_warmup_daily_requests' => 1,
        ]);
        Schema::connection('offer_test')->create($table, function (Blueprint $schema): void {
            $schema->string('key')->primary();
            $schema->text('value');
            $schema->integer('expiration');
        });
        Schema::connection('offer_test')->create($locks, function (Blueprint $schema): void {
            $schema->string('key')->primary();
            $schema->string('owner');
            $schema->integer('expiration');
        });
        try {
            Http::fake(['*' => Http::response([])]);
            $first = app(StaysOfferWarmup::class);
            $first->remember($this->context());
            $this->assertSame(1, $first->warmOne()['requests']);
            Queue::fake();
            WarmStaysOffers::dispatch($first->key());
            Cache::purge('offer_test');
            DB::purge('offer_test');
            $second = app(StaysOfferWarmup::class);
            WarmStaysOffers::dispatch($second->key());
            Queue::assertPushed(WarmStaysOffers::class, 1);
            $this->travel(61)->seconds();
            $second->remember([...$this->context(), 'guests' => 3]);
            $this->assertSame(0, $second->warmOne()['requests']);
            Http::assertSentCount(1);
        } finally {
            Schema::connection('offer_test')->dropIfExists($locks);
            Schema::connection('offer_test')->dropIfExists($table);
            Cache::purge('offer_test');
            DB::purge('offer_test');
            unlink($file);
        }
    }

    /** @return array{purpose: string, from: string, to: string, guests: int, limit: int, skip: int} */
    private function context(): array
    {
        return ['purpose' => 'discovery', 'from' => '2026-11-10', 'to' => '2026-11-12', 'guests' => 2, 'limit' => 8, 'skip' => 0];
    }
}
