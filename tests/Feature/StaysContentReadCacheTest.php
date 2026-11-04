<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AccommodationController;
use App\Services\StaysContentRateLimited;
use App\Services\StaysContentReadCache;
use App\Services\StaysSearchAvailabilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

class StaysContentReadCacheTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
    }

    public function test_repeated_search_uses_shared_quotes_and_metadata_with_a_new_controller_instance(): void
    {
        config(['services.stays.content_cache_store' => 'database']);
        Http::preventStrayRequests();
        Http::fake([
            '*booking/search-listings' => Http::response([[
                'id' => 'listing', '_idproperty' => 'property', 'amenities' => [['_id' => 'wifi']],
                'bookingPrice' => ['_mctotal' => ['BRL' => 750], 'feesIncluded' => true, 'fees' => []],
            ]]),
            '*translation/listing-amenities' => Http::response([['_id' => 'wifi', '_mstitle' => ['pt_BR' => 'Wi-Fi']]]),
            '*translation/property-amenities' => Http::response([['_id' => 'pool', '_mstitle' => ['pt_BR' => 'Piscina']]]),
            '*content/properties*' => Http::response([['_id' => 'property', 'amenities' => [['_id' => 'pool']]]]),
        ]);
        $params = ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'limit' => 8];
        $this->postJson('/api/search', $params)->assertOk()->assertJsonPath('data.0.listingAmenities', ['Wi-Fi'])->assertJsonPath('data.0.propertyAmenities', ['Piscina']);
        Http::assertSentCount(4);
        $this->app['router']->getRoutes()->getByAction(AccommodationController::class.'@search')->flushController();
        $this->postJson('/api/search', $params)->assertOk()->assertJsonPath('data.0.calculatedPrice.totalAmount', 750)->assertJsonPath('data.0.propertyAmenities', ['Piscina']);
        Http::assertSentCount(4);
    }

    public function test_resorts_reuses_the_shared_property_page_without_another_upstream_call(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*content/properties*' => Http::response([['_id' => 'resort', '_mstitle' => ['pt_BR' => 'Termas']]])]);
        $this->getJson('/api/resorts')->assertOk()->assertJsonPath('data.0.name', 'Termas');
        $this->getJson('/api/resorts')->assertOk()->assertJsonPath('data.0.id', 'resort');
        Http::assertSentCount(1);
    }

    public function test_uncached_rate_limited_resorts_returns_503_without_repeating_the_request(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*content/properties*' => Http::response([], 429, ['Retry-After' => '60'])]);
        $this->getJson('/api/resorts')->assertServiceUnavailable()->assertJsonPath('data', []);
        $this->getJson('/api/resorts')->assertServiceUnavailable();
        Http::assertSentCount(1);
    }

    public function test_property_cache_keeps_only_fields_needed_by_public_mapping(): void
    {
        Http::preventStrayRequests();
        $expected = [['_id' => 'property', '_mstitle' => ['pt_BR' => 'Termas'], 'amenities' => [['_id' => 'pool']]]];
        Http::fake(['*content/properties*' => Http::response([[...$expected[0], 'images' => ['unused-heavy-gallery'], 'ownerEmail' => 'private@example.test']])]);
        $cache = app(StaysContentReadCache::class);
        $this->assertSame($expected, $cache->get('/content/properties'));
        $this->assertSame($expected, $cache->get('/content/properties'));
        Http::assertSentCount(1);
    }

    public function test_fresh_auxiliary_lists_expire_after_five_minutes_and_are_isolated_by_account(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['*translation/listing-amenities' => Http::sequence()->push([['_id' => 'first']])->push([['_id' => 'updated']])->push([])]);
        $cache = app(StaysContentReadCache::class);
        $this->assertSame([['_id' => 'first']], $cache->get('/translation/listing-amenities'));
        $this->travel(299)->seconds();
        $this->assertSame([['_id' => 'first']], $cache->get('/translation/listing-amenities'));
        Http::assertSentCount(1);
        $this->travel(2)->seconds();
        $this->assertSame([['_id' => 'updated']], $cache->get('/translation/listing-amenities'));
        config(['services.stays.client_id' => 'other-client']);
        $this->assertSame([], $cache->get('/translation/listing-amenities'));
        Http::assertSentCount(3);
    }

    public function test_property_page_query_order_is_normalized_but_offsets_are_isolated(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*content/properties*' => Http::response([])]);
        $cache = app(StaysContentReadCache::class);
        $cache->get('/content/properties', ['limit' => 100, 'skip' => 0, 'status' => 'active']);
        $cache->get('/content/properties', ['status' => 'active', 'skip' => 0, 'limit' => 100]);
        Http::assertSentCount(1);
        $cache->get('/content/properties', ['limit' => 100, 'skip' => 100, 'status' => 'active']);
        Http::assertSentCount(2);
    }

    public function test_failed_or_malformed_reads_are_not_cached_as_empty_lists(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*translation/listing-amenities' => Http::sequence()->push([], 503)->push(['error' => 'invalid'])->push([['error' => 'invalid']])->push([])]);
        $cache = app(StaysContentReadCache::class);
        $this->assertNull($cache->get('/translation/listing-amenities'));
        $this->assertNull($cache->get('/translation/listing-amenities'));
        $this->assertNull($cache->get('/translation/listing-amenities'));
        $this->assertSame([], $cache->get('/translation/listing-amenities'));
        $this->assertSame([], $cache->get('/translation/listing-amenities'));
        Http::assertSentCount(4);
    }

    public function test_forced_refresh_failure_preserves_the_existing_fresh_auxiliary_list(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*translation/listing-amenities' => Http::sequence()->push([['_id' => 'wifi']])->push([], 503)]);
        $cache = app(StaysContentReadCache::class);
        $cache->get('/translation/listing-amenities');
        $this->assertNull($cache->get('/translation/listing-amenities', forceRefresh: true));
        $this->assertSame([['_id' => 'wifi']], $cache->get('/translation/listing-amenities'));
        Http::assertSentCount(2);
    }

    public function test_content_rate_limit_pauses_uncached_searches_but_preserves_fresh_metadata(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake([
            '*translation/listing-amenities' => Http::response([['_id' => 'wifi']]),
            '*content/properties*' => Http::sequence()->push([], 429, ['Retry-After' => '60'])->push([]),
        ]);
        $cache = app(StaysContentReadCache::class);
        $cache->get('/translation/listing-amenities');
        try {
            $cache->get('/content/properties');
            $this->fail('A rate-limited content read must pause public cache misses.');
        } catch (StaysContentRateLimited $limited) {
            $this->assertSame(60, $limited->retryAfterSeconds);
        }
        $this->assertSame([['_id' => 'wifi']], $cache->get('/translation/listing-amenities'));
        $this->assertNull(app(StaysSearchAvailabilityService::class)->search(['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2]));
        Http::assertSentCount(2);
        $this->travel(61)->seconds();
        $this->assertSame([], $cache->get('/content/properties'));
        Http::assertSentCount(3);
    }

    public function test_a_shorter_retry_after_does_not_reduce_the_existing_pause(): void
    {
        $this->freezeTime();
        $cache = app(StaysContentReadCache::class);
        $cache->pause(new StaysContentRateLimited(120));
        $this->travel(1)->seconds();
        $cache->pause(new StaysContentRateLimited(2));
        $this->assertSame(119, $cache->remainingCooldown());
    }

    public function test_private_or_commercial_endpoints_cannot_use_the_descriptive_cache(): void
    {
        Http::preventStrayRequests();
        $this->expectException(InvalidArgumentException::class);
        app(StaysContentReadCache::class)->get('/booking/reservations');
    }
}
