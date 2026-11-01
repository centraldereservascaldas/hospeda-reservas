<?php

namespace Tests\Feature;

use App\Services\StaysDiscoveryCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class StaysDiscoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array', 'app.url' => 'https://centraldereservascaldas.com',
            'services.stays.base_url' => 'https://stays.example.test/external/v1',
            'services.stays.client_id' => 'discovery-test', 'services.stays.client_secret' => 'test-secret',
        ]);
    }

    private function property(array $changes = []): array
    {
        return array_replace([
            '_id' => 'property-1', 'id' => 'P1', 'status' => 'active',
            '_mstitle' => ['pt_BR' => 'CRCN - Jardim das Águas'],
            '_msdesc' => ['pt_BR' => str_repeat('Estrutura do empreendimento com espaços de descanso e convivência. ', 4)],
            'address' => ['city' => 'Caldas Novas', 'stateCode' => 'GO', 'region' => 'Centro', 'additional' => 'private-unit-number'],
            '_t_mainImageMeta' => ['url' => 'https://images.example.test/condominio.jpg'],
            '_t_imagesMeta' => [['url' => 'https://images.example.test/piscina.jpg']],
            'amenities' => [['_id' => 'pool']],
            'owner' => ['email' => 'private-owner@example.test'],
            'customFields' => ['wifiPassword' => 'private-access-code'],
        ], $changes);
    }

    private function listing(array $changes = []): array
    {
        return array_replace($this->property(), [
            '_id' => 'listing-object-1', 'id' => 'APT01', '_idproperty' => 'property-1',
            '_mstitle' => ['pt_BR' => 'Apartamento com varanda'],
            '_msdesc' => ['pt_BR' => str_repeat('A unidade dispõe de quarto separado e ambiente para refeições. ', 4)],
            'listingCategories' => ['vacationRental'], '_i_maxGuests' => 4,
            '_i_rooms' => 1, '_i_beds' => 2, '_f_bathrooms' => 1,
        ], $changes);
    }

    private function fakeInventory(array $properties, array $listings): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($properties, $listings) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_contains($path, '/translation/')) {
                return Http::response([['_id' => 'pool', '_mstitle' => ['pt_BR' => 'Piscina compartilhada']]]);
            }
            foreach (['properties' => $properties, 'listings' => $listings] as $kind => $items) {
                if ($path === '/external/v1/content/'.$kind) {
                    return Http::response(array_slice($items, (int) $request['skip'], (int) $request['limit']));
                }
                foreach ($items as $item) {
                    if ($path === '/external/v1/content/'.$kind.'/'.$item['_id']) {
                        return Http::response($item);
                    }
                }
            }

            return Http::response([], 404);
        });
    }

    public function test_sync_creates_public_condominium_pages_metadata_and_sitemap_from_stays_without_writes(): void
    {
        $this->fakeInventory([$this->property()], [$this->listing(), $this->listing(['_id' => 'hidden', 'id' => 'HIDDEN', 'status' => 'hidden'])]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->get('/condominios')->assertOk()->assertSee('Jardim das Águas')->assertSee('/condominios/jardim-das-aguas', false);
        $response = $this->get('/condominios/jardim-das-aguas', ['Host' => 'evil.test']);
        $response->assertOk()->assertSee('Piscina compartilhada')->assertSee('Até 4 hóspedes')
            ->assertSee('/apartamento/APT01/apartamento-com-varanda', false)->assertSee('propertyId=property-1', false)
            ->assertSee('https://centraldereservascaldas.com/condominios/jardim-das-aguas', false)
            ->assertDontSee('private-owner')->assertDontSee('private-access')->assertDontSee('private-unit')->assertDontSee('evil.test');
        preg_match('~<script type="application/ld\+json">(.*?)</script>~s', $response->getContent(), $matches);
        $schema = json_decode($matches[1], true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('https://schema.org', $schema['@context']);
        $this->assertSame('Place', $schema['@graph'][4]['@type']);
        $this->getJson('/api/public/property-metadata/APT01')->assertOk()->assertJsonPath('approved', true)
            ->assertJsonPath('canonicalUrl', 'https://centraldereservascaldas.com/apartamento/APT01/apartamento-com-varanda');
        $this->get('/sitemap.xml')->assertOk()->assertSee('/condominios/jardim-das-aguas', false)
            ->assertSee('/apartamento/APT01/apartamento-com-varanda', false)->assertDontSee('HIDDEN', false);
        $this->get('/condominios/property-1/nome-antigo')->assertStatus(301)
            ->assertRedirect('https://centraldereservascaldas.com/condominios/jardim-das-aguas');
        $this->get('/condominios/P1')->assertStatus(301)
            ->assertRedirect('https://centraldereservascaldas.com/condominios/jardim-das-aguas');
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/content/properties'));
        $this->assertTrue(collect(Http::recorded())->every(fn (array $pair): bool => $pair[0]->method() === 'GET'));
    }

    public function test_sync_paginates_beyond_the_first_page_and_never_publishes_a_partial_refresh(): void
    {
        $listings = [];
        for ($i = 1; $i <= 101; $i++) {
            $listings[] = $this->listing(['_id' => 'object-'.$i, 'id' => 'APT'.$i]);
        }
        $this->fakeInventory([$this->property()], $listings);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $snapshot = app(StaysDiscoveryCatalog::class)->snapshot();
        $this->assertCount(101, $snapshot['listings']);
        $this->assertCount(101, $snapshot['properties']['property-1']['listingIds']);
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/content/listings?') && (int) $request['skip'] === 100);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response((int) $request['skip'] === 0 ? array_slice($listings, 0, 100) : ['error' => 'unavailable'], (int) $request['skip'] === 0 ? 200 : 503));
        Sleep::fake();
        $this->artisan('stays:sync-discovery')->assertFailed();
        $this->assertCount(101, app(StaysDiscoveryCatalog::class)->snapshot()['listings']);
    }

    public function test_duplicate_names_have_distinct_urls_and_short_codes_redirect(): void
    {
        $this->fakeInventory([
            $this->property(),
            $this->property(['_id' => 'property-2', 'id' => 'P2']),
        ], [
            $this->listing(),
            $this->listing(['_id' => 'listing-object-2', 'id' => 'APT02', '_idproperty' => 'property-2']),
        ]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->get('/condominios/jardim-das-aguas')->assertOk();
        $this->get('/condominios/jardim-das-aguas-p2')->assertOk();
        $this->get('/condominios/P2')->assertStatus(301)
            ->assertRedirect('https://centraldereservascaldas.com/condominios/jardim-das-aguas-p2');
        $this->get('/sitemap.xml')->assertSee('/condominios/jardim-das-aguas', false)
            ->assertSee('/condominios/jardim-das-aguas-p2', false);
    }

    public function test_slug_stays_reserved_when_the_property_is_renamed_or_temporarily_removed(): void
    {
        $this->fakeInventory([$this->property()], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->fakeInventory([], []);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->fakeInventory([$this->property(['_mstitle' => ['pt_BR' => 'Novo Nome']])], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->get('/condominios/jardim-das-aguas')->assertOk()->assertSee('Novo Nome');
        $this->get('/condominios/P1')->assertStatus(301)
            ->assertRedirect('https://centraldereservascaldas.com/condominios/jardim-das-aguas');
        $this->fakeInventory([$this->property(['_id' => 'property-2', 'id' => 'P2'])], [
            $this->listing(['_id' => 'listing-object-2', 'id' => 'APT02', '_idproperty' => 'property-2']),
        ]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->get('/condominios/jardim-das-aguas')->assertNotFound();
        $this->get('/condominios/jardim-das-aguas-p2')->assertOk();
    }

    public function test_apartment_html_contains_public_stays_content_and_links_to_its_parent_without_javascript(): void
    {
        $this->fakeInventory([$this->property()], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $original = is_file(public_path('index.html')) ? file_get_contents(public_path('index.html')) : null;
        file_put_contents(public_path('index.html'), '<!doctype html><html><head><title>CRCN</title></head><body><div id="root"></div></body></html>');
        try {
            $this->get('/apartamento/APT01?from=2026-12-01&to=2026-12-05')->assertStatus(301)
                ->assertRedirect('https://centraldereservascaldas.com/apartamento/APT01/apartamento-com-varanda?from=2026-12-01&to=2026-12-05');
            $this->get('/apartamento/APT01?amenity=piscina&amenity=wifi&adults=2&children=1')->assertStatus(301)
                ->assertRedirect('https://centraldereservascaldas.com/apartamento/APT01/apartamento-com-varanda?amenity=piscina&amenity=wifi&adults=2&children=1');
            $this->get('/apartamento/APT01/nome-antigo')->assertStatus(301)
                ->assertRedirect('https://centraldereservascaldas.com/apartamento/APT01/apartamento-com-varanda');
            $response = $this->get('/apartamento/APT01/apartamento-com-varanda');
            $response->assertOk()->assertSee('Até 4 hóspedes')->assertSee('Comodidades da unidade')
                ->assertSee('/condominios/jardim-das-aguas', false)->assertSee('"@type":"Accommodation"', false)
                ->assertSee('https://centraldereservascaldas.com/apartamento/APT01/apartamento-com-varanda', false)
                ->assertDontSee('private-owner')->assertDontSee('private-access');
            $this->getJson('/api/accommodations')->assertOk()->assertJsonPath('data.0.complexName', 'Jardim das Águas')
                ->assertJsonPath('data.0.complexImages.0', 'https://images.example.test/condominio.jpg')
                ->assertJsonPath('data.0.complexPageUrl', '/condominios/jardim-das-aguas');
        } finally {
            if ($original === null) {
                unlink(public_path('index.html'));
            } else {
                file_put_contents(public_path('index.html'), $original);
            }
        }
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/content/listings'));
    }

    public function test_hidden_inactive_incomplete_and_editorially_blocked_records_are_not_indexed(): void
    {
        $this->fakeInventory([$this->property(), $this->property(['_id' => 'inactive', 'status' => 'inactive'])], [
            $this->listing(), $this->listing(['id' => 'THIN', '_id' => 'thin', '_msdesc' => ['pt_BR' => 'Descrição curta.']]),
            $this->listing(['id' => 'FOREIGN', '_id' => 'foreign', '_mstitle' => ['en_US' => 'English only']]),
        ]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        config(['property_metadata.listings.APT01' => ['approved' => false, 'indexable' => false]]);
        $this->getJson('/api/public/property-metadata/APT01')->assertJsonPath('approved', false);
        $this->getJson('/api/public/property-metadata/THIN')->assertJsonPath('approved', false);
        $this->get('/sitemap.xml')->assertDontSee('/apartamento/APT01', false)->assertDontSee('/apartamento/THIN', false)->assertDontSee('inactive', false);
        $this->get('/condominios/inactive')->assertNotFound();
        $this->get('/condominios/jardim-das-aguas')->assertOk()->assertSee('/apartamento/THIN', false)->assertDontSee('FOREIGN');
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/content/listings'));
    }

    public function test_failed_sync_preserves_previous_snapshot_but_successful_empty_inventory_removes_local_pages(): void
    {
        Sleep::fake();
        $this->fakeInventory([$this->property()], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['https://stays.example.test/external/v1/*' => Http::response([], 503)]);
        $this->artisan('stays:sync-discovery')->assertFailed();
        $this->get('/condominios/jardim-das-aguas')->assertOk();
        $this->fakeInventory([], []);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->get('/condominios/jardim-das-aguas')->assertNotFound();
        $this->get('/condominios')->assertHeader('X-Robots-Tag', 'noindex, follow');
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/content/properties'));
    }

    public function test_pages_only_read_snapshot_and_expired_snapshot_returns_503_instead_of_empty_indexable_page(): void
    {
        $this->freezeTime();
        Sleep::fake();
        $this->fakeInventory([$this->property()], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        $this->get('/condominios/jardim-das-aguas')->assertOk();
        $this->travel(25)->hours();
        $this->get('/condominios')->assertStatus(503);
        $this->get('/condominios/jardim-das-aguas')->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_public_html_and_structured_data_escape_stays_content_and_reject_unsafe_media(): void
    {
        $this->fakeInventory([$this->property(['_mstitle' => ['pt_BR' => 'Lugar </script><script>alert(1)</script> & descanso'],
            '_t_mainImageMeta' => ['url' => 'javascript:alert(1)'], '_t_imagesMeta' => [['url' => 'https://images.example.test/safe.jpg']]])], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $snapshot = app(StaysDiscoveryCatalog::class)->snapshot();
        $property = $snapshot['properties']['property-1'];
        $this->assertSame(['https://images.example.test/safe.jpg'], $property['images']);
        $this->get(app(StaysDiscoveryCatalog::class)->propertyPath($property))->assertOk()->assertDontSee('<script>alert(1)</script>', false)
            ->assertSee('Lugar &amp; descanso', false)->assertDontSee('javascript:', false);
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/translation/property-amenities'));
    }

    public function test_incomplete_property_is_visible_but_not_in_sitemap_and_discovery_cache_is_scoped_to_account(): void
    {
        $this->fakeInventory([$this->property(['_msdesc' => ['pt_BR' => 'Em atualização.']])], [$this->listing()]);
        $this->artisan('stays:sync-discovery')->assertSuccessful();
        $this->get('/condominios/jardim-das-aguas')->assertOk()->assertHeader('X-Robots-Tag', 'noindex, follow');
        $this->get('/sitemap.xml')->assertDontSee('/condominios/property-1/', false)->assertSee('/apartamento/APT01', false);
        config(['services.stays.client_id' => 'another-account']);
        $this->get('/condominios')->assertStatus(503);
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/content/properties'));
    }
}
