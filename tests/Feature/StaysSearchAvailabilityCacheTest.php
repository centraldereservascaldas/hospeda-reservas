<?php

namespace Tests\Feature;

use App\Services\StaysCalendarService;
use App\Services\StaysSearchAvailabilityService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StaysSearchAvailabilityCacheTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array', 'services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
    }

    public function test_reuses_identical_search_without_extending_its_deadline_and_refreshes_after_expiry(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $first = $service->search($this->context());
        $this->travel(20)->seconds();
        $this->assertSame($first, $service->search($this->context()));
        Http::assertSentCount(1);
        $this->travel(26)->seconds();
        $fresh = $service->search($this->context());
        $this->assertNotSame($first['meta']['expiresAt'], $fresh['meta']['expiresAt']);
        Http::assertSentCount(2);
    }

    public function test_normalizes_city_order_but_isolates_guests_pages_and_accounts(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $service->search([...$this->context(), 'cities' => ['B', 'A']]);
        $service->search([...$this->context(), 'cities' => ['A', 'B']]);
        Http::assertSentCount(1);
        $service->search([...$this->context(), 'guests' => 3, 'cities' => ['A', 'B']]);
        $service->search([...$this->context(), 'skip' => 8, 'cities' => ['A', 'B']]);
        config(['services.stays.client_id' => 'other-client']);
        $service->search([...$this->context(), 'cities' => ['A', 'B']]);
        Http::assertSentCount(4);
    }

    public function test_failures_and_partial_quotes_are_not_cached(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::sequence()->push(['error' => 'unavailable'], 503)->push([['id' => 'missing']])->push([]),
            'https://stays.test/external/v1/booking/calculate-price' => Http::response([], 503),
        ]);
        $service = app(StaysSearchAvailabilityService::class);
        $this->assertNull($service->search($this->context()));
        $this->assertSame(1, $service->search($this->context())['unquotedCount']);
        $this->assertSame(0, $service->search($this->context())['unquotedCount']);
        Http::assertSentCount(4);
    }

    public function test_generation_invalidation_discards_previously_cached_search(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $service->search($this->context());
        $service->invalidate();
        $service->search($this->context());
        Http::assertSentCount(2);
    }

    public function test_endpoint_reuses_confirmed_prices_and_calendar_invalidation_refreshes_them(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([
            ['id' => 'quoted', 'bookingPrice' => ['_mctotal' => ['BRL' => 750], 'feesIncluded' => true, 'fees' => []]],
        ])]);
        $first = $this->postJson('/api/search', $this->context())->assertOk()->assertJsonPath('data.0.calculatedPrice.totalAmount', 750)->json();
        $this->travel(20)->seconds();
        $this->postJson('/api/search', $this->context())->assertOk()->assertJsonPath('meta.expiresAt', $first['meta']['expiresAt']);
        Http::assertSentCount(1);
        app(StaysCalendarService::class)->invalidate('quoted');
        $this->postJson('/api/search', $this->context())->assertOk();
        Http::assertSentCount(2);
    }

    /** @return array{from: string, to: string, guests: int, limit: int} */
    private function context(): array
    {
        return ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'limit' => 8];
    }
}
