<?php

namespace Tests\Feature;

use App\Services\StaysCalendarService;
use App\Services\StaysSearchAvailabilityService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
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

    public function test_payload_deadline_wins_when_cache_ttl_rounding_retains_the_snapshot_longer(): void
    {
        $this->travelTo(now()->startOfSecond()->addMilliseconds(800));
        Http::preventStrayRequests();
        Http::fake(function () {
            $this->travelTo(now()->addMilliseconds(5500));

            return Http::response([]);
        });
        $service = app(StaysSearchAvailabilityService::class);
        $first = $service->search($this->context());
        $this->travelTo(CarbonImmutable::parse($first['meta']['expiresAt'])->addMilliseconds(100));
        $second = $service->search($this->context());
        $this->assertNotSame($first['meta']['expiresAt'], $second['meta']['expiresAt']);
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

    public function test_rate_limit_pauses_uncached_searches_for_the_account_until_retry_after(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::sequence()
            ->push(['error' => 'limited'], 429, ['Retry-After' => '2'])->push([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $this->assertNull($service->search($this->context()));
        $this->assertNull($service->search([...$this->context(), 'guests' => 3]));
        Http::assertSentCount(1);
        $this->travel(2)->seconds();
        $this->assertSame([], $service->search($this->context())['items']);
        Http::assertSentCount(2);
    }

    public function test_rate_limit_does_not_hide_a_still_valid_cached_page_or_block_other_accounts(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::sequence()
            ->push([])->push([], 429)->push([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $cached = $service->search($this->context());
        $this->assertNull($service->search([...$this->context(), 'skip' => 8]));
        $this->assertSame($cached, $service->search($this->context()));
        config(['services.stays.client_id' => 'other-account']);
        $this->assertIsArray($service->search($this->context()));
        Http::assertSentCount(3);
    }

    public function test_price_batch_rate_limit_preserves_quoted_items_and_pauses_following_cache_misses(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([
                ['id' => 'priced', 'bookingPrice' => ['_mctotal' => ['BRL' => 750], 'feesIncluded' => true, 'fees' => []]],
                ['id' => 'pending'],
            ]),
            'https://stays.test/external/v1/booking/calculate-price' => Http::response([], 429, ['Retry-After' => now()->addSeconds(60)->toRfc7231String()]),
        ]);
        $service = app(StaysSearchAvailabilityService::class);
        $result = $service->search($this->context());
        $this->assertCount(1, $result['items']);
        $this->assertSame(1, $result['unquotedCount']);
        $this->travel(59)->seconds();
        $this->assertNull($service->search([...$this->context(), 'skip' => 8]));
        Http::assertSentCount(2);
        $this->travel(1)->seconds();
        $this->assertIsArray($service->search($this->context()));
        Http::assertSentCount(4);
    }

    #[DataProvider('retryAfterDelays')]
    public function test_rate_limit_fallback_and_safety_bounds(string $header, int $seconds): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::sequence()
            ->push([], 429, ['Retry-After' => $header])->push([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $this->assertNull($service->search($this->context()));
        $this->travel($seconds - 1)->seconds();
        $this->assertNull($service->search($this->context()));
        Http::assertSentCount(1);
        $this->travel(1)->seconds();
        $this->assertIsArray($service->search($this->context()));
        Http::assertSentCount(2);
    }

    /** @return array<string, array{string, int}> */
    public static function retryAfterDelays(): array
    {
        return ['invalid header' => ['not-a-date', 15], 'natural language is not a retry date' => ['tomorrow', 15], 'zero delay' => ['0', 1], 'maximum delay' => ['999999999', 86400]];
    }

    public function test_refreshes_nearly_expired_cache_without_waiting_for_the_payload_deadline(): void
    {
        $this->travelTo(now()->startOfSecond());
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $first = $service->search($this->context());
        $this->travel(39)->seconds();
        $this->assertSame($first, $service->search($this->context()));
        Http::assertSentCount(1);
        $this->travel(1)->seconds();
        $fresh = $service->search($this->context());
        $this->assertNotSame($first['meta']['fetchedAt'], $fresh['meta']['fetchedAt']);
        $this->assertSame(now()->toIso8601String(), $fresh['meta']['fetchedAt']);
        $this->assertSame(now()->addSeconds(45)->toIso8601String(), $fresh['meta']['expiresAt']);
        $this->assertSame($fresh, $service->search($this->context()));
        Http::assertSentCount(2);
    }

    #[DataProvider('shortCacheLifetimes')]
    public function test_short_configured_ttl_keeps_cache_hits_until_absolute_expiry(int $seconds): void
    {
        $this->travelTo(now()->startOfSecond());
        config(['services.stays.search_cache_ttl' => $seconds]);
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $first = $service->search($this->context());
        $this->assertSame($first, $service->search($this->context()));
        Http::assertSentCount(1);
        $this->travel($seconds)->seconds();
        $this->assertNotSame($first, $service->search($this->context()));
        Http::assertSentCount(2);
    }

    /** @return array<string, array{int}> */
    public static function shortCacheLifetimes(): array
    {
        return ['one second' => [1], 'two seconds' => [2], 'five seconds' => [5]];
    }

    public function test_rate_limit_during_early_refresh_keeps_still_valid_snapshot_without_new_requests(): void
    {
        $this->travelTo(now()->startOfSecond());
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::sequence()
            ->push([])->push([], 429, ['Retry-After' => '30'])]);
        $service = app(StaysSearchAvailabilityService::class);
        $first = $service->search($this->context());
        $this->travel(40)->seconds();
        $this->assertSame($first, $service->search($this->context()));
        $this->travel(2)->seconds();
        $this->assertSame($first, $service->search($this->context()));
        $this->travel(3)->seconds();
        $this->assertNull($service->search($this->context()));
        Http::assertSentCount(2);
    }

    public function test_near_expiry_recomputation_still_requires_the_external_request_budget(): void
    {
        $this->travelTo(now()->startOfSecond());
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);
        $service = app(StaysSearchAvailabilityService::class);
        $service->search($this->context());
        $this->travel(39)->seconds();
        $checks = 0;
        $deny = function () use (&$checks): bool {
            $checks++;

            return false;
        };
        $this->assertIsArray($service->search($this->context(), $deny));
        $this->assertSame(0, $checks);
        $this->travel(1)->seconds();
        $this->assertNull($service->search($this->context(), $deny));
        $this->assertSame(1, $checks);
        Http::assertSentCount(1);
        $this->assertIsArray($service->search($this->context()));
        Http::assertSentCount(2);
    }

    /** @return array{from: string, to: string, guests: int, limit: int} */
    private function context(): array
    {
        return ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'limit' => 8];
    }
}
