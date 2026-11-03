<?php

namespace Tests\Feature;

use App\Services\StaysAccommodationCatalog;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StaysAccommodationCatalogTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
    }

    public function test_transient_refresh_failure_keeps_last_complete_catalog_but_not_after_retention_expires(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['*content/listings*' => Http::sequence()
            ->push([['id' => 'listing', '_mstitle' => ['pt_BR' => 'Confirmado']]])
            ->push([], 503)->push([], 503)]);
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.title', 'Confirmado');
        $this->travel(301)->seconds();
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.title', 'Confirmado');
        $this->travel(86100)->seconds();
        $this->getJson('/api/accommodations')->assertServiceUnavailable()->assertJsonPath('data', []);
        Http::assertSentCount(3);
    }

    public function test_valid_empty_catalog_replaces_previous_content_instead_of_preserving_deleted_listings(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake(['*content/listings*' => Http::sequence()
            ->push([['id' => 'listing']])->push([])]);
        $this->getJson('/api/accommodations')->assertOk()->assertJsonCount(1, 'data');
        $this->travel(301)->seconds();
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data', []);
        Http::assertSentCount(2);
    }

    public function test_content_is_isolated_by_stays_account(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*content/listings*' => Http::sequence()
            ->push([['id' => 'first']])->push([['id' => 'second']])]);
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.id', 'first');
        config(['services.stays.client_id' => 'another-account']);
        $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.id', 'second');
        Http::assertSentCount(2);
    }

    public function test_incomplete_amenity_refresh_does_not_replace_last_complete_snapshot(): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        Http::fake([
            '*content/listings*' => Http::sequence()
                ->push([['id' => 'listing', '_mstitle' => ['pt_BR' => 'Completo']]])
                ->push([['id' => 'listing', '_mstitle' => ['pt_BR' => 'Incompleto'], 'amenities' => [['_id' => 'wifi']]]]),
            '*translation/listing-amenities*' => Http::response([], 503),
        ]);
        $catalog = app(StaysAccommodationCatalog::class);
        $this->assertSame('Completo', $catalog->get()['data'][0]['title']);
        $this->travel(301)->seconds();
        $this->assertSame('Completo', $catalog->get()['data'][0]['title']);
        Http::assertSentCount(3);
    }
}
