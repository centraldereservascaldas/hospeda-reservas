<?php

namespace Tests\Feature;

use App\Services\StaysCalendarService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StaysCalendarCacheTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array', 'services.stays.client_id' => 'calendar-test', 'services.stays.client_secret' => 'test', 'services.stays.calendar_cache_ttl' => 45]);
        Cache::flush();
        Http::preventStrayRequests();
    }

    public function test_calendar_cache_expires_and_can_be_invalidated_without_changing_data_contract(): void
    {
        Http::fake(['*' => Http::response([['date' => '2026-11-10', 'avail' => 1]])]);
        $service = app(StaysCalendarService::class);
        $first = $service->get('listing', '2026-11-01', '2026-11-30');
        $this->assertSame($first, $service->get('listing', '2026-11-01', '2026-11-30'));
        $this->assertSame(1, $first['data'][0]['avail']);
        $this->assertArrayHasKey('expiresAt', $first['meta']);
        Http::assertSentCount(1);
        $this->travel(46)->seconds();
        $service->get('listing', '2026-11-01', '2026-11-30');
        Http::assertSentCount(2);
        $service->invalidate('listing');
        $service->get('listing', '2026-11-01', '2026-11-30');
        Http::assertSentCount(3);
    }

    public function test_errors_and_malformed_calendar_are_not_cached(): void
    {
        Http::fake(['*' => Http::sequence()->pushStatus(503)->push(['error' => 'invalid'])->push([['date' => '2026-11-10', 'avail' => 0]])]);
        $service = app(StaysCalendarService::class);
        $this->assertNull($service->get('listing', '2026-11-01', '2026-11-30'));
        $this->assertNull($service->get('listing', '2026-11-01', '2026-11-30'));
        $this->assertSame(0, $service->get('listing', '2026-11-01', '2026-11-30')['data'][0]['avail']);
        Http::assertSentCount(3);
    }

    public function test_empty_calendars_are_cached_and_listing_and_range_are_isolated(): void
    {
        Http::fake(['*' => Http::response([])]);
        $service = app(StaysCalendarService::class);
        $this->assertSame([], $service->get('one', '2026-11-01', '2026-11-30')['data']);
        $service->get('one', '2026-11-01', '2026-11-30');
        $service->get('two', '2026-11-01', '2026-11-30');
        $service->get('one', '2026-12-01', '2026-12-31');
        Http::assertSentCount(3);
    }
}
