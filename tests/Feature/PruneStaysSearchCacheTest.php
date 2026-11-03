<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PruneStaysSearchCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_removes_only_expired_search_snapshots_and_preserves_fresh_and_unrelated_entries(): void
    {
        $this->freezeTime();
        config(['services.stays.search_cache_store' => 'database']);
        $prefix = Cache::store('database')->getStore()->getPrefix();
        foreach ([
            ['stays.search.v1:expired', -1], ['stays.search.v2:expired', -1],
            ['stays.search.v1:fresh', 60], ['stays.calendar.v2:expired', -1],
            ['stays.search.generation:account', 999999],
        ] as [$key, $ttl]) {
            DB::table('cache')->insert(['key' => $prefix.$key, 'value' => serialize([]), 'expiration' => now()->timestamp + $ttl]);
        }
        $this->artisan('stays:prune-search-cache')->expectsOutput('Expired search snapshots removed: 2')->assertSuccessful();
        $this->assertDatabaseCount('cache', 3);
        $this->assertDatabaseHas('cache', ['key' => $prefix.'stays.search.v1:fresh']);
        $this->assertDatabaseHas('cache', ['key' => $prefix.'stays.calendar.v2:expired']);
        $this->assertDatabaseHas('cache', ['key' => $prefix.'stays.search.generation:account']);
    }

    public function test_limits_work_per_invocation_and_can_resume_the_remaining_expired_entries(): void
    {
        $this->freezeTime();
        config(['services.stays.search_cache_store' => 'database']);
        $prefix = Cache::store('database')->getStore()->getPrefix();
        $rows = [];
        for ($index = 0; $index < 2001; $index++) {
            $rows[] = ['key' => $prefix.'stays.search.v1:'.$index, 'value' => serialize([]), 'expiration' => now()->timestamp - 1];
        }
        foreach (array_chunk($rows, 200) as $batch) {
            DB::table('cache')->insert($batch);
        }
        $this->artisan('stays:prune-search-cache')->assertSuccessful();
        $this->assertDatabaseCount('cache', 1);
        $this->artisan('stays:prune-search-cache')->assertSuccessful();
        $this->assertDatabaseCount('cache', 0);
    }

    public function test_treats_configured_prefix_as_literal_and_preserves_other_namespaces(): void
    {
        $this->freezeTime();
        config(['services.stays.search_cache_store' => 'database', 'cache.prefix' => 'reserva_á%:']);
        $prefix = Cache::store('database')->getStore()->getPrefix();
        DB::table('cache')->insert([
            ['key' => $prefix.'stays.search.v1:expired', 'value' => serialize([]), 'expiration' => now()->timestamp - 1],
            ['key' => 'reserva_Xother:stays.search.v1:expired', 'value' => serialize([]), 'expiration' => now()->timestamp - 1],
        ]);
        $this->artisan('stays:prune-search-cache')->assertSuccessful();
        $this->assertDatabaseCount('cache', 1);
        $this->assertDatabaseHas('cache', ['key' => 'reserva_Xother:stays.search.v1:expired']);
    }

    public function test_non_database_stores_do_not_trigger_database_cleanup(): void
    {
        config(['services.stays.search_cache_store' => 'array']);
        Cache::store('array')->put('stays.search.v1:fresh', ['data' => []], 45);
        $this->artisan('stays:prune-search-cache')->assertSuccessful();
        $this->assertSame(['data' => []], Cache::store('array')->get('stays.search.v1:fresh'));
    }
}
