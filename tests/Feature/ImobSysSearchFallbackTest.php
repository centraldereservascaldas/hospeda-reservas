<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AccommodationController;
use App\Http\Requests\SearchAccommodationsRequest;
use App\Services\ImobSysSearchClient;
use App\Services\StaysAccommodationMapper;
use App\Services\StaysOfferWarmup;
use App\Services\StaysSearchAvailabilityService;
use App\Services\StaysSimulator;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Mockery\MockInterface;
use Tests\TestCase;

class ImobSysSearchFallbackTest extends TestCase
{
    public function test_published_catalog_filters_condominium_and_guest_capacity_without_fabricating_quotes(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/properties*' => Http::response([
            'success' => true, 'publicationRevision' => 7,
            'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
            'data' => [
                ['id' => 'imobsys-crcn-2-663', 'title' => 'Apartamento 101', 'condominiumId' => 'imobsys-crcn-condo-86', 'condominiumName' => 'Lacqua II', 'capacity' => 5, 'images' => []],
                ['id' => 'imobsys-crcn-2-664', 'title' => 'Apartamento 102', 'condominiumName' => 'Lacqua II', 'capacity' => 1, 'images' => []],
                ['id' => 'imobsys-crcn-2-665', 'title' => 'Apartamento 103', 'condominiumName' => 'Outro', 'capacity' => 5, 'images' => []],
                ['id' => 'imobsys-crcn-2-666', 'title' => 'Apartamento 104', 'condominiumId' => 'imobsys-crcn-condo-99', 'condominiumName' => 'Lacqua II', 'capacity' => 5, 'images' => []],
            ],
        ])]);
        $client = app(ImobSysSearchClient::class);
        $items = $client->catalogForCondominium('Lacqua II', 2, 'imobsys-crcn-condo-86');
        $this->assertCount(1, $items);
        $mapped = $client->mapCatalogProperties($items);
        $this->assertSame('imobsys-crcn-2-663', $mapped[0]['id']);
        $this->assertArrayNotHasKey('imobsysOffer', $mapped[0]);
        $this->assertArrayNotHasKey('calculatedPrice', $mapped[0]);
    }

    public function test_published_catalog_rejects_changed_revision_between_pages(): void
    {
        Http::fakeSequence()
            ->push(['success' => true, 'publicationRevision' => 1, 'data' => [], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => true]])
            ->push(['success' => true, 'publicationRevision' => 2, 'data' => [], 'pagination' => ['page' => 2, 'pageSize' => 50, 'hasMore' => false]]);
        $this->assertNull(app(ImobSysSearchClient::class)->catalogForCondominium('Lacqua II', 2));
    }

    public function test_condominium_catalog_uses_verified_partner_identifier(): void
    {
        $client = app(ImobSysSearchClient::class);
        $this->assertSame('imobsys-crcn-condo-86', $client->catalogCondominiumId('imobsys-condo-86'));
        $this->assertNull($client->catalogCondominiumId('imobsys-condo-999999999'));
    }

    public function test_condominium_search_without_dates_keeps_stays_first(): void
    {
        $previous = $this->app['env'];
        $this->app['env'] = 'production';
        try {
            $controller = \Mockery::mock(AccommodationController::class)->makePartial();
            $controller->shouldReceive('index')->once()->andReturn(response()->json(['data' => [
                ['id' => 'stays-1', 'title' => 'Lacqua II', 'maxGuests' => 5],
            ]]));
            $request = SearchAccommodationsRequest::create('/api/search', 'POST', ['destination' => 'Lacqua II', 'guests' => 2]);
            $request->setValidator(Validator::make($request->all(), $request->rules()));
            $simulator = \Mockery::mock(StaysSimulator::class);
            $simulator->shouldReceive('enabled')->andReturn(false);
            $imobsys = \Mockery::mock(ImobSysSearchClient::class)->makePartial();
            $imobsys->shouldReceive('isEnabled')->andReturn(true);
            $imobsys->shouldReceive('verifiedStaysPropertyId')->andReturn('stays-condo');
            $imobsys->shouldReceive('catalogCondominiumName')->andReturn('Lacqua II');
            $imobsys->shouldReceive('catalogCondominiumId')->andReturn('imobsys-crcn-condo-86');
            $imobsys->shouldReceive('catalogForCondominium')->once()->with('Lacqua II', 2, 'imobsys-crcn-condo-86')->andReturn([
                ['id' => 'imobsys-crcn-2-663', 'title' => 'Apartamento 101', 'condominiumName' => 'Lacqua II', 'capacity' => 5, 'images' => []],
            ]);
            $result = $controller->search($request, $simulator, \Mockery::mock(StaysSearchAvailabilityService::class), \Mockery::mock(StaysOfferWarmup::class), $imobsys)->getData(true);
            $this->assertSame(['stays-1', 'imobsys-crcn-2-663'], array_column($result['data'], 'id'));
            $this->assertArrayNotHasKey('imobsysOffer', $result['data'][1]);
        } finally {
            $this->app['env'] = $previous;
        }
    }

    public function test_home_discovery_never_fetches_partner_catalog_without_dates(): void
    {
        $previous = $this->app['env'];
        $this->app['env'] = 'production';
        try {
            $controller = \Mockery::mock(AccommodationController::class)->makePartial();
            $controller->shouldReceive('index')->once()->andReturn(response()->json(['data' => []]));
            $request = SearchAccommodationsRequest::create('/api/search', 'POST', ['destination' => 'Lacqua II', 'purpose' => 'discovery']);
            $request->setValidator(Validator::make($request->all(), $request->rules()));
            $simulator = \Mockery::mock(StaysSimulator::class);
            $simulator->shouldReceive('enabled')->andReturn(false);
            $partner = \Mockery::mock(ImobSysSearchClient::class)->makePartial();
            $partner->shouldReceive('isEnabled')->andReturn(true);
            $partner->shouldReceive('verifiedStaysPropertyId')->andReturn('stays-condo');
            $partner->shouldReceive('catalogCondominiumName')->andReturn('Lacqua II');
            $partner->shouldReceive('catalogCondominiumId')->andReturn('imobsys-crcn-condo-86');
            $partner->shouldNotReceive('catalogForCondominium');
            $result = $controller->search($request, $simulator, \Mockery::mock(StaysSearchAvailabilityService::class), \Mockery::mock(StaysOfferWarmup::class), $partner)->getData(true);
            $this->assertSame([], $result['data']);
        } finally {
            $this->app['env'] = $previous;
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'cache.default' => 'array',
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.search_cache_store' => 'array',
            'services.stays.content_cache_store' => 'array',
            'services.stays.search_cache_ttl' => 45,
            'services.partner_api.base_url' => 'https://api.example.test',
            'services.partner_api.key' => 'test-api-key',
            'services.partner_api.search_fallback_enabled' => true,
            'services.partner_api.cache_ttl' => 25,
        ]);
    }

    public function test_fresh_supplier_lookup_does_not_reuse_site_cache(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
            'success' => true,
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'observedAt' => now()->toIso8601String(),
            'expiresAt' => now()->addSeconds(20)->toIso8601String(),
            'offers' => [],
            'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
        ])]);
        $client = app(ImobSysSearchClient::class);
        $client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663');
        $client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663');
        $client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true);
        Http::assertSentCount(2);
    }

    public function test_fresh_supplier_lookup_rejects_stale_or_missing_observation_time(): void
    {
        Http::preventStrayRequests();
        $body = ['success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'offers' => [], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false]];
        Http::fakeSequence()->push([...$body, 'observedAt' => now()->subMinute()->toIso8601String()])->push($body);
        $client = app(ImobSysSearchClient::class);
        $this->assertNull($client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true));
        $this->assertNull($client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true));
        Http::assertSentCount(2);
    }

    public function test_fresh_supplier_lookup_rejects_expired_or_missing_expiry(): void
    {
        Http::preventStrayRequests();
        $body = ['success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'observedAt' => now()->subSeconds(10)->toIso8601String(), 'offers' => [], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false]];
        Http::fakeSequence()->push([...$body, 'expiresAt' => now()->subSecond()->toIso8601String()])->push($body)->push([...$body, 'expiresAt' => now()->addSeconds(20)->toIso8601String()]);
        $client = app(ImobSysSearchClient::class);
        $this->assertNull($client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true));
        $this->assertNull($client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true));
        $this->assertSame([], $client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true));
        Http::assertSentCount(3);
    }

    public function test_fresh_supplier_offer_never_outlives_supplier_expiry(): void
    {
        Http::preventStrayRequests();
        $expiry = now()->addSeconds(10)->startOfSecond();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response(['success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'observedAt' => now()->toIso8601String(), 'expiresAt' => $expiry->toIso8601String(), 'guestCountVerified' => true, 'offers' => [['id' => 'imobsys-crcn-2-663', 'capacity' => 5, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'nights' => 2, 'totalCents' => 52300, 'currency' => 'BRL', 'status' => 'offer_observed', 'availabilityConfirmed' => true, 'reservationGuaranteed' => false]], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false]])]);
        $offers = app(ImobSysSearchClient::class)->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663', true);
        $this->assertCount(1, $offers);
        $this->assertSame($expiry->timestamp, $offers[0]['_crcnExpiresAt']);
    }

    public function test_cached_search_refreshes_when_supplier_offer_expires(): void
    {
        Http::preventStrayRequests();
        $observed = now()->startOfSecond();
        $offer = ['id' => 'imobsys-crcn-2-663', 'capacity' => 5, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'nights' => 2, 'totalCents' => 52300, 'currency' => 'BRL', 'status' => 'offer_observed', 'availabilityConfirmed' => false, 'reservationGuaranteed' => false];
        $body = ['success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'observedAt' => $observed->toIso8601String(), 'offers' => [$offer], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false]];
        Http::fakeSequence()->push([...$body, 'expiresAt' => $observed->copy()->addSeconds(5)->toIso8601String()])->push([...$body, 'expiresAt' => $observed->copy()->addSeconds(20)->toIso8601String(), 'offers' => [[...$offer, 'totalCents' => 52400]]]);
        $client = app(ImobSysSearchClient::class);
        $this->assertSame(52300, $client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663')[0]['totalCents']);
        $this->travel(6)->seconds();
        try {
            $this->assertSame(52400, $client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663')[0]['totalCents']);
            Http::assertSentCount(2);
        } finally {
            $this->travelBack();
        }
    }

    public function test_search_never_displays_an_offer_without_a_supplier_expiry(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response(['success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'offers' => [['id' => 'imobsys-crcn-2-663', 'capacity' => 5, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'nights' => 2, 'totalCents' => 52300, 'currency' => 'BRL', 'status' => 'offer_observed', 'availabilityConfirmed' => false, 'reservationGuaranteed' => false]], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false]])]);
        $this->assertNull(app(ImobSysSearchClient::class)->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663'));
    }

    public function test_search_rejects_offer_without_valid_observation_timestamp(): void
    {
        Http::preventStrayRequests();
        $offer = ['id' => 'imobsys-crcn-2-663', 'capacity' => 5, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'nights' => 2, 'totalCents' => 52300, 'currency' => 'BRL', 'status' => 'offer_observed', 'availabilityConfirmed' => false, 'reservationGuaranteed' => false];
        $body = ['success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'expiresAt' => now()->addSeconds(20)->toIso8601String(), 'offers' => [$offer], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false]];
        Http::fakeSequence()->push($body)->push([...$body, 'observedAt' => now()->addMinute()->toIso8601String()])->push([...$body, 'observedAt' => now()->addSeconds(3)->toIso8601String(), 'expiresAt' => now()->addSecond()->toIso8601String()]);
        $client = app(ImobSysSearchClient::class);
        for ($i = 0; $i < 3; $i++) {
            $this->assertNull($client->offers('2027-01-10', '2027-01-12', 2, '', 'imobsys-crcn-2-663'));
        }
        Http::assertSentCount(3);
    }

    public function test_production_partner_detail_requires_feature_flag_and_specific_property(): void
    {
        $originalEnvironment = $this->app['env'];
        $this->app['env'] = 'production';
        try {
            config(['services.partner_api.search_fallback_enabled' => false]);
            $this->getJson('/api/imobsys/offers?from=2027-01-10&to=2027-01-12&guests=1&propertyId=imobsys-crcn-1-961')->assertForbidden();
            config(['services.partner_api.search_fallback_enabled' => true]);
            $this->getJson('/api/imobsys/offers?from=2027-01-10&to=2027-01-12&guests=1')->assertUnprocessable()->assertJsonValidationErrors('propertyId');
        } finally {
            $this->app['env'] = $originalEnvironment;
        }
    }

    public function test_partner_search_fails_closed_when_the_server_key_is_missing(): void
    {
        config(['services.partner_api.key' => '']);
        Http::preventStrayRequests();

        $this->getJson('/api/imobsys/offers?from=2027-01-10&to=2027-01-12&guests=1&propertyId=imobsys-crcn-1-961')
            ->assertServiceUnavailable();

        Http::assertNothingSent();
    }

    public function test_partner_search_rejects_unsafe_base_urls_and_redirects(): void
    {
        Http::preventStrayRequests();
        foreach (['https://user:password@api.example.test', 'https://api.example.test?destination=elsewhere', 'https://api.example.test#fragment'] as $url) {
            config(['services.partner_api.base_url' => $url]);
            $this->assertNull(app(ImobSysSearchClient::class)->offers('2027-01-10', '2027-01-12', 2, ''));
        }
        Http::assertNothingSent();
        config(['services.partner_api.base_url' => 'https://api.example.test']);
        Http::fake(['https://api.example.test/v1/offers*' => Http::response('', 302, ['Location' => 'https://other.example.test/offers'])]);
        $this->assertNull(app(ImobSysSearchClient::class)->offers('2027-01-10', '2027-01-12', 2, ''));
        Http::assertSentCount(1);
    }

    public function test_partner_detail_passes_one_guest_without_changing_the_requested_occupancy(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
            'observedAt' => now()->toIso8601String(),
            'expiresAt' => now()->addSeconds(20)->toIso8601String(),
            'success' => true, 'source' => 'imobsys-live', 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 1,
            'offers' => [[
                'id' => 'imobsys-crcn-1-961', 'condominiumName' => 'Piazza', 'unit' => '204', 'capacity' => 4,
                'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 1, 'nights' => 2,
                'totalCents' => 52300, 'currency' => 'BRL', 'status' => 'offer_observed',
                'availabilityConfirmed' => false, 'reservationGuaranteed' => false,
            ]], 'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
        ])]);
        $this->getJson('/api/imobsys/offers?from=2027-01-10&to=2027-01-12&guests=1&propertyId=imobsys-crcn-1-961')
            ->assertOk()->assertJsonPath('data.0.id', 'imobsys-crcn-1-961');
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/v1/offers')
            && (int) $request['guests'] === 1
            && $request['propertyId'] === 'imobsys-crcn-1-961'
            && $request->hasHeader('Authorization', 'Bearer test-api-key'));
    }

    public function test_resorts_include_active_unmatched_imobsys_condominiums(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*content/properties*' => Http::response([['_id' => 'stays-1', '_mstitle' => ['pt_BR' => 'Termas']]])]);

        $this->getJson('/api/resorts')->assertOk()
            ->assertJsonFragment(['id' => 'stays-1', 'name' => 'Termas'])
            ->assertJsonFragment(['id' => 'imobsys-condo-22', 'name' => 'AGUAS DA FONTE']);
    }

    public function test_does_not_fall_back_when_a_later_stays_page_cannot_be_checked(): void
    {
        Http::preventStrayRequests();
        $this->mock(StaysSearchAvailabilityService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->once()->withArgs(fn (array $input): bool => $input['limit'] === 100 && $input['skip'] === 0)
                ->andReturn(['items' => [], 'unquotedCount' => 0, 'receivedCount' => 100, 'meta' => [
                    'fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String(),
                ]]);
            $mock->shouldReceive('search')->once()->withArgs(fn (array $input): bool => $input['skip'] === 100)->andReturnNull();
        });

        $this->postJson('/api/search', [
            'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'destination' => 'Lacqua', 'limit' => 12,
        ])->assertStatus(503)->assertJsonPath('code', 'availability_unavailable');
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'api.example.test'));
    }

    public function test_individual_preview_stops_after_finding_the_requested_property(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
            'observedAt' => now()->toIso8601String(),
            'expiresAt' => now()->addSeconds(20)->toIso8601String(),
            'success' => true, 'source' => 'imobsys-live', 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2,
            'offers' => [[
                'id' => 'imobsys-crcn-2-663', 'condominiumName' => 'Termas', 'unit' => '101',
                'description' => 'Apartamento', 'capacity' => 4, 'from' => '2027-01-10', 'to' => '2027-01-12',
                'guests' => 2, 'nights' => 2, 'totalCents' => 52300, 'currency' => 'BRL',
                'status' => 'offer_observed', 'availabilityConfirmed' => false, 'reservationGuaranteed' => false,
            ]],
            'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => true],
        ])]);

        $this->getJson('/api/imobsys/offers?from=2027-01-10&to=2027-01-12&guests=2&propertyId=imobsys-crcn-2-663')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', 'imobsys-crcn-2-663');
        Http::assertSentCount(1);
    }

    public function test_uses_imobsys_when_stays_has_no_results_for_the_requested_condominium(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([]),
            'https://api.example.test/v1/offers*' => Http::response([
                'expiresAt' => now()->addSeconds(20)->toIso8601String(),
                'success' => true,
                'source' => 'imobsys-live',
                'from' => '2027-01-10',
                'to' => '2027-01-12',
                'guests' => 2,
                'observedAt' => '2026-11-20T12:00:00Z',
                'offers' => [[
                    'id' => 'imobsys-crcn-2-663',
                    'condominiumId' => 'imobsys-crcn-condo-86',
                    'condominiumName' => "L'Ácqua",
                    'unit' => '101',
                    'description' => 'Permitido 4 pessoas',
                    'capacity' => 4,
                    'from' => '2027-01-10',
                    'to' => '2027-01-12',
                    'guests' => 2,
                    'nights' => 2,
                    'totalCents' => 52300,
                    'currency' => 'BRL',
                    'status' => 'offer_observed',
                    'availabilityConfirmed' => false,
                    'reservationGuaranteed' => false,
                    'images' => [],
                ], [
                    'id' => 'imobsys-crcn-2-664',
                    'condominiumId' => null,
                    'condominiumName' => 'Lacqua II',
                    'unit' => '202',
                    'description' => 'Permitido 4 pessoas',
                    'capacity' => 4,
                    'from' => '2027-01-10',
                    'to' => '2027-01-12',
                    'guests' => 2,
                    'nights' => 2,
                    'totalCents' => 60000,
                    'currency' => 'BRL',
                    'status' => 'offer_observed',
                    'availabilityConfirmed' => false,
                    'reservationGuaranteed' => false,
                    'images' => [],
                ]],
                'pagination' => ['page' => 1, 'pageSize' => 50, 'totalObserved' => 2, 'hasMore' => false],
            ]),
        ]);

        $response = $this->postJson('/api/search', [
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'destination' => 'Lacqua',
            'limit' => 12,
            'skip' => 0,
        ]);
        Http::assertSent(fn (Request $request): bool => str_starts_with($request->url(), 'https://api.example.test/v1/offers')
            && $request['from'] === '2027-01-10'
            && $request['to'] === '2027-01-12'
            && $request['guests'] === 2
            && $request->hasHeader('Authorization', 'Bearer test-api-key'));

        $response->assertOk()
            ->assertJsonPath('source', 'imobsys-live')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', 'imobsys-crcn-2-663')
            ->assertJsonPath('data.0.dataSource', 'imobsys-live')
            ->assertJsonPath('data.0.imobsysOffer.totalAmount', 523)
            ->assertJsonPath('data.0.imobsysOffer.observedAt', '2026-11-20T12:00:00Z')
            ->assertJsonPath('data.0.imobsysOffer.availabilityConfirmed', false)
            ->assertJsonPath('pagination.hasMore', false);

        $secondResponse = $this->postJson('/api/search', [
            'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2,
            'destination' => 'Lacqua II', 'limit' => 12, 'skip' => 0,
        ]);
        $secondResponse->assertOk()->assertJsonPath('data.0.id', 'imobsys-crcn-2-664');
        $this->assertSame($response->json('meta.expiresAt'), $secondResponse->json('meta.expiresAt'));
        $this->assertCount(1, Http::recorded(fn (Request $request): bool => str_contains($request->url(), '/v1/offers')));

    }

    public function test_appends_imobsys_offers_after_stays_properties_in_the_same_search_list(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
            'expiresAt' => now()->addSeconds(20)->toIso8601String(),
            'success' => true,
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'observedAt' => '2026-11-20T12:00:00Z',
            'offers' => [[
                'id' => 'imobsys-crcn-2-663',
                'condominiumName' => 'Lacqua',
                'unit' => '101',
                'capacity' => 4,
                'from' => '2027-01-10',
                'to' => '2027-01-12',
                'guests' => 2,
                'nights' => 2,
                'totalCents' => 52300,
                'currency' => 'BRL',
                'status' => 'offer_observed',
                'availabilityConfirmed' => false,
                'reservationGuaranteed' => false,
            ]],
            'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
        ])]);

        $staysProperty = [
            'id' => 'stays-listing-1',
            'title' => 'Apartamento próprio Stays',
            'dataSource' => 'stays-live',
            'location' => ['city' => 'Caldas Novas', 'neighborhood' => 'Lacqua'],
        ];
        $this->mock(StaysAccommodationMapper::class)
            ->shouldReceive('map')->once()->andReturn($staysProperty);
        $this->mock(StaysSearchAvailabilityService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->once()
                ->withArgs(fn (array $input): bool => $input['limit'] === 100 && $input['skip'] === 0)
                ->andReturn([
                    'items' => [[
                        'id' => 'stays-listing-1',
                        'calculatedPrice' => ['totalAmount' => 600, 'dailyRate' => 300],
                    ]],
                    'unquotedCount' => 0,
                    'receivedCount' => 1,
                    'meta' => ['fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String()],
                ]);
        });

        $this->postJson('/api/search', [
            'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2,
            'destination' => 'Lacqua', 'limit' => 12,
        ])->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', 'stays-listing-1')
            ->assertJsonPath('data.1.id', 'imobsys-crcn-2-663')
            ->assertJsonPath('data.1.dataSource', 'imobsys-live')
            ->assertJsonPath('data.1.imobsysOffer.availabilityConfirmed', false);
    }

    public function test_filtered_destination_pages_keep_eligible_stays_first_and_do_not_skip_partner(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
            'success' => true, 'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2,
            'observedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(20)->toIso8601String(),
            'offers' => [['id' => 'imobsys-crcn-2-663', 'condominiumName' => 'Lacqua', 'capacity' => 4,
                'from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'nights' => 2,
                'totalCents' => 52300, 'currency' => 'BRL', 'status' => 'offer_observed',
                'availabilityConfirmed' => false, 'reservationGuaranteed' => false]],
            'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
        ])]);
        $items = array_map(fn (int $i): array => ['id' => 'stays-'.$i, 'calculatedPrice' => ['totalAmount' => 600, 'dailyRate' => 300]], range(1, 101));
        $this->mock(StaysAccommodationMapper::class)->shouldReceive('map')->times(303)->andReturnUsing(
            fn (array $listing): array => ['id' => $listing['id'], 'title' => in_array($listing['id'], ['stays-1', 'stays-3', 'stays-101'], true) ? 'Lacqua apartamento' : 'Outro local', 'location' => ['city' => 'Caldas Novas']]
        );
        $this->mock(StaysSearchAvailabilityService::class)->shouldReceive('search')->times(6)->andReturnUsing(
            fn (array $input): array => [
                'items' => array_slice($items, $input['skip'], 100), 'unquotedCount' => 0,
                'receivedCount' => count(array_slice($items, $input['skip'], 100)),
                'meta' => ['fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String()],
            ]
        );
        $search = ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'destination' => 'Lacqua', 'limit' => 2];
        $this->postJson('/api/search', [...$search, 'skip' => 0])->assertOk()
            ->assertJsonPath('data.0.id', 'stays-1')->assertJsonPath('data.1.id', 'stays-3')
            ->assertJsonPath('pagination.nextSkip', 2)->assertJsonPath('pagination.hasMore', true);
        $this->postJson('/api/search', [...$search, 'skip' => 2])->assertOk()
            ->assertJsonPath('data.0.id', 'stays-101')->assertJsonPath('data.1.id', 'imobsys-crcn-2-663')
            ->assertJsonPath('pagination.nextSkip', 4)->assertJsonPath('pagination.hasMore', false);
        $this->postJson('/api/search', [...$search, 'skip' => 4])->assertOk()
            ->assertJsonCount(0, 'data')->assertJsonPath('pagination.hasMore', false);
    }

    public function test_filtered_search_returns_stays_but_reports_unavailable_partner_after_last_stays_page(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([], 503)]);
        $items = array_map(fn (int $i): array => ['id' => 'stays-'.$i, 'calculatedPrice' => ['totalAmount' => 600, 'dailyRate' => 300]], range(1, 2));
        $this->mock(StaysAccommodationMapper::class)->shouldReceive('map')->times(4)->andReturnUsing(
            fn (array $listing): array => ['id' => $listing['id'], 'title' => 'Lacqua apartamento', 'location' => ['city' => 'Caldas Novas']]
        );
        $this->mock(StaysSearchAvailabilityService::class)->shouldReceive('search')->twice()->andReturn([
            'items' => $items, 'unquotedCount' => 0, 'receivedCount' => 2,
            'meta' => ['fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String()],
        ]);
        $search = ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'destination' => 'Lacqua', 'limit' => 2];
        $this->postJson('/api/search', [...$search, 'skip' => 0])->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('pagination.hasMore', true);
        $this->postJson('/api/search', [...$search, 'skip' => 2])->assertStatus(503)->assertJsonPath('code', 'partner_unavailable');
    }

    public function test_appends_imobsys_after_the_last_stays_page_when_all_condominiums_are_searched(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
            'expiresAt' => now()->addSeconds(20)->toIso8601String(),
            'success' => true,
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'observedAt' => '2026-11-20T12:00:00Z',
            'offers' => [[
                'id' => 'imobsys-crcn-2-663',
                'condominiumName' => 'Lacqua',
                'unit' => '101',
                'capacity' => 4,
                'from' => '2027-01-10',
                'to' => '2027-01-12',
                'guests' => 2,
                'nights' => 2,
                'totalCents' => 52300,
                'currency' => 'BRL',
                'status' => 'offer_observed',
                'availabilityConfirmed' => false,
                'reservationGuaranteed' => false,
            ]],
            'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
        ])]);

        $this->mock(StaysAccommodationMapper::class)
            ->shouldReceive('map')->twice()->andReturn(
                ['id' => 'stays-listing-1', 'title' => 'Stays 1', 'location' => ['city' => 'Caldas Novas']],
                ['id' => 'stays-listing-2', 'title' => 'Stays 2', 'location' => ['city' => 'Caldas Novas']],
            );
        $this->mock(StaysSearchAvailabilityService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->twice()
                ->andReturn(
                    [
                        'items' => [
                            ['id' => 'stays-listing-1', 'calculatedPrice' => ['totalAmount' => 600, 'dailyRate' => 300]],
                            ['id' => 'stays-listing-2', 'calculatedPrice' => ['totalAmount' => 700, 'dailyRate' => 350]],
                        ],
                        'unquotedCount' => 0,
                        'receivedCount' => 2,
                        'meta' => ['fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String()],
                    ],
                    [
                        'items' => [], 'unquotedCount' => 0, 'receivedCount' => 0,
                        'meta' => ['fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String()],
                    ],
                );
        });

        $search = ['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'limit' => 2];
        $this->postJson('/api/search', [...$search, 'skip' => 0])
            ->assertOk()->assertJsonPath('data.0.id', 'stays-listing-1')
            ->assertJsonPath('data.1.id', 'stays-listing-2')
            ->assertJsonPath('pagination.hasMore', true);

        $this->postJson('/api/search', [...$search, 'skip' => 2])
            ->assertOk()->assertJsonPath('source', 'imobsys-live')
            ->assertJsonPath('data.0.id', 'imobsys-crcn-2-663')
            ->assertJsonPath('pagination.hasMore', false);
    }

    public function test_keeps_imobsys_disabled_when_the_feature_flag_is_off(): void
    {
        config(['services.partner_api.search_fallback_enabled' => false]);
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);

        $this->postJson('/api/search', [
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'destination' => 'Lacqua',
        ])->assertOk()->assertJsonPath('source', 'stays-live')->assertJsonCount(0, 'data');

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'api.example.test'));
    }

    public function test_ignores_cached_mixed_pagination_when_imobsys_is_disabled(): void
    {
        config(['services.partner_api.search_fallback_enabled' => false]);
        Http::preventStrayRequests();
        Http::fake([]);

        $from = '2027-01-10';
        $to = '2027-01-12';
        $searchKey = 'imobsys.mixed-search.v1.'.hash('sha256', json_encode([
            'https://api.example.test', $from, $to, 2, '', null, [],
        ], JSON_THROW_ON_ERROR));
        Cache::put($searchKey, 0, now()->addMinutes(10));

        $this->mock(StaysAccommodationMapper::class)
            ->shouldReceive('map')->once()->andReturn([
                'id' => 'stays-listing-1',
                'title' => 'Apartamento próprio Stays',
                'location' => ['city' => 'Caldas Novas'],
            ]);
        $this->mock(StaysSearchAvailabilityService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('search')->once()
                ->withArgs(fn (array $input): bool => $input['skip'] === 0 && $input['limit'] === 12)
                ->andReturn([
                    'items' => [[
                        'id' => 'stays-listing-1',
                        'calculatedPrice' => ['totalAmount' => 600, 'dailyRate' => 300],
                    ]],
                    'unquotedCount' => 0,
                    'receivedCount' => 1,
                    'meta' => ['fetchedAt' => now()->toIso8601String(), 'expiresAt' => now()->addSeconds(45)->toIso8601String()],
                ]);
        });

        $this->postJson('/api/search', [
            'from' => $from, 'to' => $to, 'guests' => 2, 'limit' => 12,
        ])->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonPath('data.0.id', 'stays-listing-1');

        Http::assertNothingSent();
    }

    public function test_loads_only_safe_media_for_a_property_returned_by_search(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([]),
            'https://api.example.test/v1/offers*' => Http::response([
                'observedAt' => now()->toIso8601String(),
                'expiresAt' => now()->addSeconds(20)->toIso8601String(),
                'success' => true,
                'source' => 'imobsys-live',
                'from' => '2027-01-10',
                'to' => '2027-01-12',
                'guests' => 2,
                'offers' => [[
                    'id' => 'imobsys-crcn-2-663',
                    'condominiumName' => 'LACQUA DIROMA',
                    'condominiumId' => 'imobsys-crcn-condo-86',
                    'unit' => '101',
                    'capacity' => 4,
                    'from' => '2027-01-10',
                    'to' => '2027-01-12',
                    'guests' => 2,
                    'nights' => 2,
                    'totalCents' => 52300,
                    'currency' => 'BRL',
                    'status' => 'offer_observed',
                    'availabilityConfirmed' => false,
                    'reservationGuaranteed' => false,
                ]],
                'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
            ]),
            'https://api.example.test/v1/properties/imobsys-crcn-2-663' => Http::response([
                'success' => true,
                'data' => [[
                    'id' => 'imobsys-crcn-2-663',
                    'description' => 'QUARTO: cama de casal',
                    'images' => [
                        'https://reservascrcn.com.br/fotos/tt/imoveis/086-10189/fotos/unit.png',
                        'https://evil.example/fotos/tt/imoveis/086-10189/fotos/fake.png',
                        'https://reservascrcn.com.br/fotos/crcn/condominios/086/fotos/pool.png',
                    ],
                ]],
            ]),
        ]);

        $this->postJson('/api/search', [
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'propertyId' => '6a344a029a142d820bc4fd81',
        ])->assertOk();

        $this->getJson('/api/accommodations/imobsys-crcn-2-663/media')
            ->assertOk()
            ->assertJsonPath('source', 'imobsys-live')
            ->assertJsonPath('data.propertyId', 'imobsys-crcn-2-663')
            ->assertJsonPath('data.description', 'QUARTO: cama de casal')
            ->assertJsonCount(1, 'data.images')
            ->assertJsonPath('data.images.0', 'https://reservascrcn.com.br/fotos/tt/imoveis/086-10189/fotos/unit.png');

        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/v1/properties/imobsys-crcn-2-663')
            && $request->hasHeader('Authorization', 'Bearer test-api-key'));
    }

    public function test_does_not_fetch_media_for_an_imobsys_property_not_returned_by_search(): void
    {
        Http::preventStrayRequests();
        Http::fake([]);

        $this->getJson('/api/accommodations/imobsys-crcn-2-663/media')->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_uses_verified_crosswalk_when_search_has_only_a_stays_condominium_id(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([]),
            'https://api.example.test/v1/offers*' => Http::response([
                'observedAt' => now()->toIso8601String(),
                'expiresAt' => now()->addSeconds(20)->toIso8601String(),
                'success' => true,
                'source' => 'imobsys-live',
                'from' => '2027-01-10',
                'to' => '2027-01-12',
                'guests' => 2,
                'offers' => [[
                    'id' => 'imobsys-crcn-2-663',
                    'condominiumName' => 'LACQUA DIROMA',
                    'unit' => '101',
                    'capacity' => 4,
                    'from' => '2027-01-10',
                    'to' => '2027-01-12',
                    'guests' => 2,
                    'nights' => 2,
                    'totalCents' => 52300,
                    'currency' => 'BRL',
                    'status' => 'offer_observed',
                    'availabilityConfirmed' => false,
                    'reservationGuaranteed' => false,
                ]],
                'pagination' => ['page' => 1, 'pageSize' => 50, 'hasMore' => false],
            ]),
        ]);

        $response = $this->postJson('/api/search', [
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'propertyId' => '6a344a029a142d820bc4fd81',
        ]);

        Http::assertSent(fn (Request $request): bool => str_starts_with($request->url(), 'https://api.example.test/v1/offers')
            && $request->hasHeader('Authorization', 'Bearer test-api-key'));
        $response->assertOk()
            ->assertJsonPath('source', 'imobsys-live')
            ->assertJsonPath('data.0.id', 'imobsys-crcn-2-663');
    }

    public function test_does_not_use_a_suggested_crosswalk_for_a_stays_condominium_id(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([]),
        ]);

        $this->postJson('/api/search', [
            'from' => '2027-01-10',
            'to' => '2027-01-12',
            'guests' => 2,
            'destination' => 'Lacqua',
            'propertyId' => 'stays-pending-id',
        ])->assertOk()
            ->assertJsonPath('source', 'stays-live')
            ->assertJsonCount(0, 'data');

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/v1/offers'));
    }
}
