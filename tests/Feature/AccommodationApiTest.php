<?php

namespace Tests\Feature;

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

    public function test_production_catalog_and_undated_search_fail_when_stays_is_unavailable(): void
    {
        app()->instance('env', 'production');

        $this->getJson('/api/accommodations')
            ->assertServiceUnavailable()
            ->assertJsonPath('source', 'unavailable');
        $this->postJson('/api/search', ['guests' => 2])
            ->assertServiceUnavailable()
            ->assertJsonPath('source', 'unavailable');
    }

    public function test_production_catalog_preserves_a_genuinely_empty_stays_result(): void
    {
        app()->instance('env', 'production');
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*' => Http::response([], 200)]);

        $this->getJson('/api/accommodations')
            ->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonCount(0, 'data');
    }

    public function test_production_detail_returns_not_found_only_for_stays_not_found_response(): void
    {
        app()->instance('env', 'production');
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*content/listings/missing-listing' => Http::response(['internal' => 'do not expose'], 404)]);

        $this->getJson('/api/accommodations/missing-listing')
            ->assertNotFound()
            ->assertJsonPath('success', false)
            ->assertDontSee('do not expose');
    }

    public function test_production_detail_keeps_upstream_failure_unavailable(): void
    {
        app()->instance('env', 'production');
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*content/listings/JQ08G' => Http::response(['internal' => 'do not expose'], 500)]);

        $this->getJson('/api/accommodations/JQ08G')
            ->assertServiceUnavailable()
            ->assertJsonPath('success', false)
            ->assertDontSee('do not expose');
    }

    public function test_production_detail_rejects_successful_but_malformed_stays_payload(): void
    {
        app()->instance('env', 'production');
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);

        foreach ([[], [['id' => 'JQ08G']], ['id' => ' ']] as $payload) {
            Http::fake(['*content/listings/JQ08G' => Http::response($payload, 200)]);
            $this->getJson('/api/accommodations/JQ08G')
                ->assertServiceUnavailable()
                ->assertJsonPath('success', false);
        }
    }

    public function test_production_detail_keeps_connection_failure_unavailable(): void
    {
        app()->instance('env', 'production');
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*content/listings/JQ08G' => Http::failedConnection()]);

        $this->getJson('/api/accommodations/JQ08G')
            ->assertServiceUnavailable()
            ->assertJsonPath('success', false);
    }

    public function test_production_undated_search_filters_live_catalog_by_city(): void
    {
        app()->instance('env', 'production');
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*content/listings*' => Http::response([
            ['id' => 'caldas', '_mstitle' => ['pt_BR' => 'Caldas'], 'address' => ['city' => 'Caldas Novas']],
            ['id' => 'goiania', '_mstitle' => ['pt_BR' => 'Goiânia'], 'address' => ['city' => 'Goiânia']],
        ], 200)]);

        $this->postJson('/api/search', ['guests' => 1, 'cities' => ['Caldas Novas']])
            ->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', 'caldas');
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

    public function test_live_detail_keeps_the_stays_main_image_before_gallery_images(): void
    {
        config([
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);
        Http::preventStrayRequests();
        Http::fake([
            'https://crcn.stays.net/external/v1/content/listings/live-listing' => Http::response([
                '_id' => 'live-object',
                'id' => 'live-listing',
                '_mstitle' => ['pt_BR' => 'Anúncio com capa explícita'],
                '_t_mainImageMeta' => ['url' => 'https://crcn.stays.net/cover.jpg'],
                '_t_imagesMeta' => [
                    ['_id' => 'gallery-one', 'url' => 'https://crcn.stays.net/gallery-one.jpg'],
                    ['_id' => 'gallery-two', 'url' => 'https://crcn.stays.net/gallery-two.jpg'],
                ],
            ], 200),
            'https://crcn.stays.net/external/v1/content/listings*' => Http::response([[
                '_id' => 'live-object',
                'id' => 'live-listing',
                '_mstitle' => ['pt_BR' => 'Anúncio com capa explícita'],
                '_t_mainImageMeta' => ['url' => 'https://crcn.stays.net/cover.jpg'],
                '_t_imagesMeta' => [
                    ['_id' => 'gallery-one', 'url' => 'https://crcn.stays.net/gallery-one.jpg'],
                    ['_id' => 'gallery-two', 'url' => 'https://crcn.stays.net/gallery-two.jpg'],
                ],
            ]], 200),
            'https://crcn.stays.net/external/v1/content/listing-rooms/live-listing' => Http::response([], 200),
        ]);

        $this->getJson('/api/accommodations/live-listing')
            ->assertOk()
            ->assertJsonPath('data.images.0', 'https://crcn.stays.net/cover.jpg')
            ->assertJsonPath('data.images.1', 'https://crcn.stays.net/gallery-one.jpg')
            ->assertJsonPath('data.images.2', 'https://crcn.stays.net/gallery-two.jpg')
            ->assertJsonCount(3, 'data.images');
    }

    public function test_live_catalog_translates_listing_and_property_amenity_ids_for_cards(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::preventStrayRequests();
        Http::fake([
            'https://crcn.stays.net/external/v1/content/listings*' => Http::response([[
                '_id' => 'object-live-amenities',
                'id' => 'live-amenities',
                '_idproperty' => 'property-live-amenities',
                '_mstitle' => ['pt_BR' => 'Anúncio com comodidades'],
                'amenities' => [['_id' => 'amenity-wifi']],
            ], [
                '_id' => 'object-live-amenities-2',
                'id' => 'live-amenities-2',
                '_idproperty' => 'property-live-amenities-2',
                '_mstitle' => ['pt_BR' => 'Segundo anúncio com comodidades'],
                'amenities' => [['_id' => 'amenity-kitchen']],
            ]], 200),
            'https://crcn.stays.net/external/v1/content/properties*' => Http::response([[
                '_id' => 'property-live-amenities',
                'amenities' => [['_id' => 'amenity-pool']],
            ], [
                '_id' => 'property-live-amenities-2',
                'amenities' => [['_id' => 'amenity-parking']],
            ]], 200),
            'https://crcn.stays.net/external/v1/translation/listing-amenities' => Http::response([[
                '_id' => 'amenity-wifi',
                '_mstitle' => ['pt_BR' => 'Wi-Fi'],
            ], [
                '_id' => 'amenity-kitchen',
                '_mstitle' => ['pt_BR' => 'Cozinha completa'],
            ]], 200),
            'https://crcn.stays.net/external/v1/translation/property-amenities' => Http::response([[
                '_id' => 'amenity-pool',
                '_mstitle' => ['pt_BR' => 'Piscina aquecida'],
            ], [
                '_id' => 'amenity-parking',
                '_mstitle' => ['pt_BR' => 'Estacionamento'],
            ]], 200),
        ]);

        $response = $this->getJson('/api/accommodations');

        $response->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonPath('data.0.listingAmenities.0', 'Wi-Fi')
            ->assertJsonPath('data.0.propertyAmenities.0', 'Piscina aquecida')
            ->assertJsonPath('data.0.amenities.0', 'Wi-Fi')
            ->assertJsonPath('data.0.amenities.1', 'Piscina aquecida')
            ->assertJsonPath('data.1.listingAmenities.0', 'Cozinha completa')
            ->assertJsonPath('data.1.propertyAmenities.0', 'Estacionamento');

        Http::assertSentCount(4);
    }

    public function test_dated_live_search_maps_stays_result_and_quote(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*booking/search-listings' => Http::response([['id' => 'JQ08G', 'code' => 'JQ08G', '_mstitle' => ['pt_BR' => 'Apto teste'], '_i_maxGuests' => 4, 'dailyRate' => 325, 'bookingPrice' => ['_mctotal' => ['BRL' => 900], 'feesIncluded' => true, 'fees' => []]]], 200)]);
        $this->postJson('/api/search', ['from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])->assertOk()->assertJsonPath('source', 'stays-live')->assertJsonPath('data.0.pricePerNight', 325)->assertJsonPath('data.0.calculatedPrice.totalAmount', 900);
    }

    public function test_dated_live_search_keeps_bookable_listing_without_fabricating_a_quote(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*booking/search-listings' => Http::response([['id' => 'JQ08G', 'code' => 'JQ08G', '_mstitle' => ['pt_BR' => 'Apto reservável'], '_i_maxGuests' => 4, 'dailyRate' => 325]], 200)]);

        $this->postJson('/api/search', ['from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])
            ->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.pricePerNight', 325)
            ->assertJsonMissingPath('data.0.calculatedPrice');
    }
}
