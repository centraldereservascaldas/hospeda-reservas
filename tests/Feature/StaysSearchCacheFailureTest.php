<?php

namespace Tests\Feature;

use App\Services\StaysCalendarService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

class StaysSearchCacheFailureTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_cache_failure_returns_503_without_unlocked_upstream_requests(): void
    {
        config(['services.stays.search_cache_store' => 'database']);
        Exceptions::fake();
        Http::preventStrayRequests();
        Schema::drop('cache');
        $this->postJson('/api/search', ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2])
            ->assertStatus(503)->assertJsonPath('code', 'availability_unavailable');
        Http::assertNothingSent();
        Exceptions::assertReported(RuntimeException::class);
        Exceptions::assertNotReported(QueryException::class);
    }

    public function test_search_cache_failure_does_not_abort_calendar_invalidation_after_a_reservation(): void
    {
        config(['cache.default' => 'array', 'services.stays.search_cache_store' => 'database']);
        Exceptions::fake();
        Schema::drop('cache');
        app(StaysCalendarService::class)->invalidate('listing');
        Exceptions::assertReported(RuntimeException::class);
        Exceptions::assertNotReported(QueryException::class);
    }
}
