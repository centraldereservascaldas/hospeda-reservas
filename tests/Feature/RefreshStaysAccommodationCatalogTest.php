<?php

namespace Tests\Feature;

use App\Jobs\RefreshStaysAccommodationCatalog;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysExternalApiClient;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RefreshStaysAccommodationCatalogTest extends TestCase
{
    use DatabaseTruncation;

    protected function beforeTruncatingDatabase(): void
    {
        $inMemory = config('database.default') === 'sqlite' && config('database.connections.sqlite.database') === ':memory:';
        if ($inMemory) {
            RefreshDatabaseState::$migrated = false;
        }
        $this->beforeApplicationDestroyed(function () use ($inMemory): void {
            $this->truncateTablesForAllConnections();
            if ($inMemory) {
                RefreshDatabaseState::$migrated = false;
            }
        });
    }

    public function test_stale_reads_share_one_job_processed_only_by_the_discovery_worker(): void
    {
        $this->freezeTime();
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::preventStrayRequests();
        Http::fake(['*content/listings*' => Http::sequence()
            ->push([['id' => 'listing', '_mstitle' => ['pt_BR' => 'Primeira versão']]])
            ->push([['id' => 'listing', '_mstitle' => ['pt_BR' => 'Atualizado']]])]);
        $this->getJson('/api/accommodations')->assertOk();
        $this->travel(301)->seconds();
        for ($request = 0; $request < 3; $request++) {
            $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.title', 'Primeira versão');
        }
        Http::assertSentCount(1);
        $this->assertDatabaseCount('jobs', 1);
        $this->assertDatabaseHas('jobs', ['queue' => 'discovery']);
        $this->artisan('queue:work', ['connection' => 'database', '--queue' => 'default', '--once' => true, '--stop-when-empty' => true, '--sleep' => 0])->assertSuccessful();
        $this->assertDatabaseCount('jobs', 1);
        $this->artisan('queue:work', ['connection' => 'database', '--queue' => 'discovery', '--once' => true, '--stop-when-empty' => true, '--sleep' => 0])->assertSuccessful();
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 0);
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.title', 'Atualizado');
        Http::assertSentCount(2);
    }

    public function test_batch_mapping_reads_the_shared_discovery_snapshot_only_once(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret', 'services.stays.content_cache_store' => 'database']);
        Http::preventStrayRequests();
        Http::fake(['*content/listings*' => Http::response([['id' => 'first'], ['id' => 'second'], ['id' => 'third']])]);
        $reads = 0;
        DB::listen(function (QueryExecuted $query) use (&$reads): void {
            if (str_starts_with(strtolower($query->sql), 'select') && collect($query->bindings)->contains(
                fn (mixed $binding): bool => is_string($binding) && str_contains($binding, 'stays.public-discovery.v1.'),
            )) {
                $reads++;
            }
        });
        $this->getJson('/api/accommodations')->assertOk()->assertJsonCount(3, 'data');
        $this->assertSame(1, $reads);
        Http::assertSentCount(1);
    }

    public function test_bootstrap_refresh_requests_are_deduplicated_on_the_shared_store_without_upstream_calls(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret', 'services.stays.content_cache_store' => 'database']);
        Http::preventStrayRequests();
        $this->artisan('stays:queue-catalog-refresh')->assertSuccessful();
        $this->artisan('stays:queue-catalog-refresh')->assertSuccessful();
        $this->assertDatabaseCount('jobs', 1);
        $this->assertDatabaseHas('jobs', ['queue' => 'discovery']);
        Http::assertNothingSent();
    }

    public function test_unconfigured_integration_does_not_enqueue_bootstrap_work(): void
    {
        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
        Http::preventStrayRequests();
        $this->artisan('stays:queue-catalog-refresh')->assertSuccessful();
        $this->assertDatabaseCount('jobs', 0);
        Http::assertNothingSent();
    }

    public function test_cold_reads_do_not_compete_with_an_active_background_warmup(): void
    {
        $this->freezeTime();
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::preventStrayRequests();
        $catalog = app(StaysAccommodationCatalog::class);
        Cache::store('array')->put($catalog->key().':warming', true, 60);
        $this->getJson('/api/accommodations')->assertServiceUnavailable();
        Http::assertNothingSent();
        $this->travel(61)->seconds();
        Http::fake(['*content/listings*' => Http::response([])]);
        $this->getJson('/api/accommodations')->assertOk();
        Http::assertSentCount(1);
    }

    public function test_job_from_another_account_is_discarded_without_upstream_queries(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::preventStrayRequests();
        $catalog = app(StaysAccommodationCatalog::class);
        $job = new RefreshStaysAccommodationCatalog($catalog->key());
        config(['services.stays.client_id' => 'another-client']);
        $job->handle($catalog, app(StaysExternalApiClient::class));
        Http::assertNothingSent();
    }

    public function test_expired_page_fetch_budget_starts_no_external_request(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::preventStrayRequests();
        $this->assertNull(app(StaysExternalApiClient::class)->activeListings(microtime(true) - 1));
        Http::assertNothingSent();
    }
}
