<?php

namespace Tests\Feature;

use App\Services\StaysAccommodationMapper;
use App\Services\StaysSearchAvailabilityService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Mockery\MockInterface;
use Tests\TestCase;

class ImobSysSearchFallbackTest extends TestCase
{
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

    public function test_partner_detail_passes_one_guest_without_changing_the_requested_occupancy(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
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

    public function test_appends_imobsys_after_the_last_stays_page_when_all_condominiums_are_searched(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.example.test/v1/offers*' => Http::response([
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
