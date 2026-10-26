<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AccommodationApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
    }

    public function test_catalog_returns_local_fallback_without_stays_credentials(): void
    {
        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('source', 'local-catalog')->assertJsonPath('count', 19);
    }

    public function test_catalog_detail_preserves_property_contract(): void
    {
        $this->getJson('/api/accommodations/JQ08G')->assertOk()->assertJsonPath('success', true)->assertJsonPath('data.id', 'JQ08G')->assertJsonStructure(['data' => ['location', 'images', 'sleepingArrangements', 'host', 'reviews']]);
    }

    public function test_unknown_catalog_listing_returns_not_found(): void
    {
        $this->getJson('/api/accommodations/unknown-listing')->assertNotFound()->assertJsonPath('success', false);
    }

    public function test_local_search_applies_capacity_and_pagination(): void
    {
        $this->postJson('/api/search', ['guests' => 2, 'limit' => 1])->assertOk()->assertJsonPath('success', true)->assertJsonPath('data.0.calculatedPrice.currency', 'BRL')->assertJsonCount(1, 'data');
    }

    public function test_external_stays_compatibility_catalog_and_amenities_are_available(): void
    {
        $this->getJson('/external/v1/content/listings')->assertOk()->assertJsonCount(19);
        $this->getJson('/external/v1/translation/listing-amenities')->assertOk()->assertJsonPath('0.code', 'air_conditioning');
        $this->getJson('/api/external/v1/content/listings')->assertOk()->assertJsonCount(19);
        $this->getJson('/api/external/v1/translation/listing-amenities')->assertOk()->assertJsonPath('0.code', 'air_conditioning');
        $this->getJson('/api/external/v1/translation/property-amenities')->assertOk()->assertJsonPath('0.code', 'thermal_pools');
    }

    public function test_live_listing_compatibility_handles_records_without_amenities(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake([
            '*' => Http::response([[
                '_id' => 'live-listing',
                'id' => 'live-listing',
                '_mstitle' => ['pt_BR' => 'Anúncio live'],
                '_t_mainImageMeta' => ['url' => 'https://crcn.stays.net/image.jpg'],
                '_t_imagesMeta' => [
                    ['_id' => 'cover', 'url' => 'https://crcn.stays.net/image.jpg'],
                    ['_id' => 'gallery', 'url' => 'https://crcn.stays.net/gallery.jpg'],
                ],
            ]], 200),
        ]);

        $this->getJson('/api/external/v1/content/listings')
            ->assertOk()
            ->assertJsonPath('0._id', 'live-listing')
            ->assertJsonPath('0.amenities', [])
            ->assertJsonPath('0.images.0', 'https://crcn.stays.net/image.jpg')
            ->assertJsonPath('0.images.1', 'https://crcn.stays.net/gallery.jpg')
            ->assertJsonCount(2, '0.images');
    }

    public function test_live_listing_does_not_mix_local_fixture_by_business_id(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*' => Http::response([[
            '_id' => 'object-live-1',
            'id' => 'different-live-id',
            'code' => 'JQ08G',
            '_mstitle' => ['pt_BR' => 'Título fornecido pela Stays'],
            '_t_mainImageMeta' => ['url' => 'https://crcn.stays.net/live.jpg'],
        ]], 200)]);

        $this->getJson('/api/accommodations')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Título fornecido pela Stays')
            ->assertJsonPath('data.0.description', '')
            ->assertJsonPath('data.0.pricePerNight', 0)
            ->assertJsonPath('data.0.images.0', 'https://crcn.stays.net/live.jpg');
    }

    public function test_empty_live_catalog_does_not_fall_back_to_inactive_local_listings(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*' => Http::response([], 200)]);

        $this->getJson('/api/accommodations')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonPath('count', 0)
            ->assertExactJson(['success' => true, 'source' => 'stays-live', 'count' => 0, 'data' => []]);
    }

    public function test_failed_live_catalog_does_not_return_stale_local_listings(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*' => Http::response(['error' => 'unavailable'], 503)]);

        $this->getJson('/api/accommodations')
            ->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('source', 'unavailable')
            ->assertJsonPath('data', []);
    }

    public function test_failed_later_live_catalog_page_does_not_return_a_partial_catalog(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(function (ClientRequest $request): mixed {
            if (str_contains($request->url(), 'skip=50')) {
                return Http::response(['error' => 'unavailable'], 503);
            }

            return Http::response(array_fill(0, 50, ['id' => 'live-listing']), 200);
        });

        $this->getJson('/api/accommodations')
            ->assertStatus(503)
            ->assertJsonPath('source', 'unavailable');

        Http::assertSent(fn (ClientRequest $request): bool => str_contains($request->url(), 'skip=50'));
    }

    public function test_dated_live_search_maps_stays_result_and_quote(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*booking/search-listings' => Http::response([['id' => 'JQ08G', 'code' => 'JQ08G', '_mstitle' => ['pt_BR' => 'Apto teste'], '_i_maxGuests' => 4, 'dailyRate' => 325, 'bookingPrice' => ['_mctotal' => ['BRL' => 900]]]], 200)]);
        $this->postJson('/api/search', ['from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])->assertOk()->assertJsonPath('source', 'stays-live')->assertJsonPath('data.0.pricePerNight', 325)->assertJsonPath('data.0.calculatedPrice.totalAmount', 900);
    }
}
