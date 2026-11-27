<?php

namespace Tests\Feature;

use App\Services\ExistingReservationPropertySummary;
use App\Services\StaysDiscoveryCatalog;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExistingReservationPropertySummaryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->useLegacyExistingReservationFixtures();
    }

    public function test_summary_includes_only_public_property_details_and_booking_code(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true, 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        Http::preventStrayRequests();
        $listingId = str_repeat('f', 24);
        $condoId = str_repeat('e', 24);
        Http::fake(fn (Request $request) => match (true) {
            str_ends_with($request->url(), '/payments') => Http::response([]),
            str_ends_with($request->url(), '/content/listings/'.$listingId) => Http::response([
                '_id' => $listingId, '_idproperty' => $condoId, '_mstitle' => ['pt_BR' => 'Apartamento'],
                '_msdesc' => ['pt_BR' => '<p>Sala</p><script>segredo</script><p>Cozinha</p>'],
                '_t_mainImageMeta' => ['url' => 'https://example.test/main.jpg'],
                '_t_imagesMeta' => [['url' => 'https://example.test/second.jpg'], ['url' => 'javascript:alert(1)']],
                'owner' => ['name' => 'dados privados'],
            ]),
            str_ends_with($request->url(), '/content/properties/'.$condoId) => Http::response([
                '_id' => $condoId, '_mstitle' => ['pt_BR' => 'Condomínio'], '_msdesc' => ['pt_BR' => 'Piscina'],
                '_t_imagesMeta' => [['url' => 'https://example.test/pool.jpg']],
            ]),
            default => Http::response(['id' => 'ZX91K', 'partnerCode' => '123456789', 'partner' => ['name' => 'API booking.com'], 'type' => 'reserved', '_idlisting' => $listingId, 'price' => ['currency' => 'BRL', '_f_total' => 100]]),
        });

        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')->assertOk()
            ->assertJsonPath('reservation.partnerCode', '123456789')
            ->assertJsonPath('reservation.propertyDetails.images', ['https://example.test/main.jpg', 'https://example.test/second.jpg'])
            ->assertJsonPath('reservation.propertyDetails.description', "Sala\nCozinha")
            ->assertJsonPath('reservation.propertyDetails.condoTitle', 'Condomínio')
            ->assertJsonPath('reservation.propertyDetails.condoImages', ['https://example.test/pool.jpg'])
            ->assertDontSee('dados privados')->assertDontSee('segredo');
    }

    public function test_snapshot_serves_public_details_without_remote_calls(): void
    {
        $id = str_repeat('f', 24);
        $propertyId = str_repeat('e', 24);
        $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('snapshot')->once()->andReturn([
            'listings' => ['listing' => ['id' => 'listing', 'objectId' => $id, 'propertyId' => $propertyId,
                'name' => 'Apartamento', 'description' => 'Sala', 'images' => ['https://example.test/listing.jpg']]],
            'properties' => [$propertyId => ['name' => 'Condomínio', 'description' => 'Piscina', 'images' => ['https://example.test/pool.jpg']]],
        ]);
        $this->mock(StaysExternalApiClient::class)->shouldNotReceive('get');

        $result = app(ExistingReservationPropertySummary::class)->find($id);
        $this->assertSame('Apartamento', $result['title']);
        $this->assertSame(['https://example.test/pool.jpg'], $result['condoImages']);
    }

    public function test_remote_fallback_has_short_timeouts_and_returns_catalog_when_content_fails(): void
    {
        $id = str_repeat('a', 24);
        $condoId = str_repeat('b', 24);
        $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('snapshot')->once()->andReturn(null);
        $stays = $this->mock(StaysExternalApiClient::class);
        $stays->shouldReceive('get')->once()->with('/content/listings/'.$id, [], 1)->andReturn([
            '_id' => $id, '_idproperty' => $condoId, '_mstitle' => ['pt_BR' => 'Apartamento'],
        ]);
        $stays->shouldReceive('get')->once()->with('/content/properties/'.$condoId, [], 1)->andReturn(null);

        $result = app(ExistingReservationPropertySummary::class)->find($id);
        $this->assertSame('Apartamento', $result['title']);
        $this->assertSame('', $result['condoTitle']);

    }

    public function test_incomplete_snapshot_keeps_existing_fields_and_fills_missing_public_details(): void
    {
        $id = str_repeat('a', 24);
        $condoId = str_repeat('b', 24);
        $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('snapshot')->once()->andReturn([
            'listings' => [['objectId' => $id, 'propertyId' => $condoId, 'name' => 'Nome no snapshot',
                'description' => '', 'images' => []]],
            'properties' => [$condoId => ['name' => 'Condomínio no snapshot', 'description' => '', 'images' => []]],
        ]);
        $stays = $this->mock(StaysExternalApiClient::class);
        $stays->shouldReceive('get')->once()->with('/content/listings/'.$id, [], 1)->andReturn([
            '_id' => $id, '_idproperty' => $condoId, '_mstitle' => ['pt_BR' => 'Nome remoto'],
            '_msdesc' => ['pt_BR' => '<p>Descrição pública</p><script>privado</script>'],
            '_t_mainImageMeta' => ['url' => 'https://example.test/photo.jpg'],
            '_t_imagesMeta' => [['url' => 'https://example.test/photo.jpg'], ['url' => 'javascript:alert(1)']],
        ]);
        $stays->shouldReceive('get')->once()->with('/content/properties/'.$condoId, [], 1)->andReturn([
            '_id' => $condoId, '_msdesc' => ['pt_BR' => 'Piscina'],
            '_t_mainImageMeta' => ['url' => 'https://example.test/pool.jpg'],
        ]);

        $result = app(ExistingReservationPropertySummary::class)->find($id);
        $this->assertSame('Nome no snapshot', $result['title']);
        $this->assertSame('Descrição pública', $result['description']);
        $this->assertSame(['https://example.test/photo.jpg'], $result['images']);
        $this->assertSame('Condomínio no snapshot', $result['condoTitle']);
        $this->assertSame('Piscina', $result['condoDescription']);
        $this->assertSame(['https://example.test/pool.jpg'], $result['condoImages']);
    }

    public function test_empty_remote_description_does_not_hide_local_catalog_description(): void
    {
        $id = str_repeat('a', 24);
        $basePath = $this->app->basePath();
        $temporaryPath = sys_get_temp_dir().'/checkout-property-'.bin2hex(random_bytes(8));
        mkdir($temporaryPath.'/resources/data', 0700, true);
        file_put_contents($temporaryPath.'/resources/data/stays-apartments.json', json_encode([
            ['id' => $id, 'title' => 'Apartamento', 'description' => '<p>Descrição local</p><script>privado</script>'],
        ], JSON_THROW_ON_ERROR));
        $this->app->setBasePath($temporaryPath);
        try {
            $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('snapshot')->once()->andReturn(null);
            $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->once()
                ->with('/content/listings/'.$id, [], 1)->andReturn([
                    '_id' => $id, '_msdesc' => ['pt_BR' => '   '],
                ]);

            $result = app(ExistingReservationPropertySummary::class)->find($id);
            $this->assertSame('Descrição local', $result['description']);
        } finally {
            $this->app->setBasePath($basePath);
            unlink($temporaryPath.'/resources/data/stays-apartments.json');
            rmdir($temporaryPath.'/resources/data');
            rmdir($temporaryPath.'/resources');
            rmdir($temporaryPath);
        }
    }

    public function test_incomplete_snapshot_remains_available_when_fallback_fails(): void
    {
        $id = str_repeat('a', 24);
        $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('snapshot')->once()->andReturn([
            'listings' => [['objectId' => $id, 'name' => 'Apartamento', 'images' => []]],
            'properties' => [],
        ]);
        $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->once()
            ->with('/content/listings/'.$id, [], 1)->andReturn(null);

        $result = app(ExistingReservationPropertySummary::class)->find($id);
        $this->assertSame('Apartamento', $result['title']);
        $this->assertSame([], $result['images']);
    }
}
