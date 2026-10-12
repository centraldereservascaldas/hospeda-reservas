<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AccommodationApiTest extends TestCase
{
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

    public function test_dated_live_search_maps_stays_result_and_quote(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*booking/search-listings' => Http::response([['id' => 'JQ08G', 'code' => 'JQ08G', '_mstitle' => ['pt_BR' => 'Apto teste'], '_i_maxGuests' => 4, 'dailyRate' => 325, 'bookingPrice' => ['_mctotal' => ['BRL' => 900]]]], 200)]);
        $this->postJson('/api/search', ['from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])->assertOk()->assertJsonPath('source', 'stays-live')->assertJsonPath('data.0.pricePerNight', 325)->assertJsonPath('data.0.calculatedPrice.totalAmount', 900);
    }
}
