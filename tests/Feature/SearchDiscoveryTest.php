<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SearchDiscoveryTest extends TestCase
{
    private ?string $originalIndex;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://centraldereservascaldas.com']);
        $this->originalIndex = is_file(public_path('index.html')) ? file_get_contents(public_path('index.html')) : null;
        file_put_contents(public_path('index.html'), '<!doctype html><html><head><title>CRCN</title></head><body><div id="root"></div></body></html>');
    }

    protected function tearDown(): void
    {
        if ($this->originalIndex === null) {
            @unlink(public_path('index.html'));
        } else {
            file_put_contents(public_path('index.html'), $this->originalIndex);
        }
        parent::tearDown();
    }

    public function test_robots_is_text_and_advertises_the_configured_sitemap_without_blocking_page_noindex(): void
    {
        $this->get('/robots.txt')->assertOk()->assertHeader('Content-Type', 'text/plain; charset=utf-8')
            ->assertSee('Sitemap: https://centraldereservascaldas.com/sitemap.xml', false)
            ->assertDontSee('Disallow: /checkout', false)->assertDontSee('<html', false);
    }

    public function test_sitemap_contains_only_canonical_pages_and_approved_properties(): void
    {
        Http::preventStrayRequests();
        config(['property_metadata.listings' => [
            'APPROVED' => ['approved' => true, 'indexable' => true, 'title' => 'Imóvel', 'description' => 'Descrição'],
            'DRAFT' => ['approved' => true, 'indexable' => false, 'title' => 'Rascunho', 'description' => 'Descrição'],
            'INVALID/path' => ['approved' => true, 'indexable' => true, 'title' => 'Inválido', 'description' => 'Descrição'],
        ]]);
        Blade::compile(resource_path('views/seo/sitemap.blade.php'));
        $response = $this->get('/sitemap.xml?from=2026-12-01', ['Host' => 'untrusted.example']);
        $response->assertOk()->assertHeader('Content-Type', 'application/xml; charset=utf-8')
            ->assertSee('https://centraldereservascaldas.com/destinos/caldas-novas', false)
            ->assertSee('https://centraldereservascaldas.com/apartamento/APPROVED', false)
            ->assertDontSee('DRAFT', false)->assertDontSee('INVALID', false)->assertDontSee('checkout', false)
            ->assertDontSee('privacidade', false)->assertDontSee('from=', false)->assertDontSee('untrusted.example', false);
        $xml = simplexml_load_string($response->getContent());
        $this->assertNotFalse($xml);
        $coreUrls = array_filter(iterator_to_array($xml->children(), false), fn ($url) => ! str_contains((string) $url->loc, '/blog/'));
        $this->assertCount(5, $coreUrls);
        Http::assertNothingSent();
    }

    public function test_destination_and_guide_deliver_readable_html_links_and_valid_structured_data_without_javascript(): void
    {
        Http::preventStrayRequests();
        $response = $this->get('/destinos/caldas-novas');
        $response->assertOk()->assertSee('<h1>Como escolher sua hospedagem em Caldas Novas</h1>', false)
            ->assertSee('Localização e deslocamento')->assertSee('href="/guias/como-escolher-hospedagem"', false)
            ->assertSee('href="https://centraldereservascaldas.com/destinos/caldas-novas"', false)
            ->assertDontSee('/src/main.tsx', false);
        preg_match('~<script type="application/ld\+json">(.*?)</script>~s', $response->getContent(), $matches);
        $schema = json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('https://schema.org', $schema['@context']);
        $this->assertSame('BreadcrumbList', $schema['@graph'][3]['@type']);
        $this->get('/guias/como-escolher-hospedagem')->assertOk()->assertSee('Quais são as regras de chegada e cancelamento?');
        Http::assertNothingSent();
    }

    public function test_home_shows_loading_shell_with_seo_fallback_outside_react_root(): void
    {
        Http::preventStrayRequests();
        foreach (['/', '/?category=condominiums', '/?category=pools_24h'] as $path) {
            $response = $this->get($path)->assertOk()
                ->assertSee('Hospedagens em Caldas Novas e região')
                ->assertSee('Carregando hospedagens', false)
                ->assertSee('href="https://centraldereservascaldas.com/"', false);
            $document = new \DOMDocument;
            $document->loadHTML($response->getContent(), LIBXML_NOERROR | LIBXML_NOWARNING);
            $xpath = new \DOMXPath($document);
            $this->assertSame(1, $xpath->query('//*[@id="public-introduction"]')->length);
            $this->assertSame(0, $xpath->query('//*[@id="root"]//*[@id="public-introduction"]')->length,
                'SEO content must not appear inside the React root while its bundle loads.');
            $this->assertSame(1, $xpath->query('//noscript//*[@id="public-introduction"]')->length,
                'The SEO fallback must remain available when JavaScript is disabled.');
            $this->assertSame(1, $xpath->query('//*[@id="root"]//*[@class="home-loading"]')->length,
                'The React root must show a branded loading shell before the application mounts.');
        }
        Http::assertNothingSent();
    }

    public function test_home_contains_public_content_and_canonical_in_initial_html(): void
    {
        $this->get('/?destination=Caldas+Novas', ['Host' => 'untrusted.example'])->assertOk()
            ->assertSee('Hospedagens em Caldas Novas e região')
            ->assertSee('href="https://centraldereservascaldas.com/"', false)
            ->assertSee('id="public-page-schema"', false)->assertDontSee('untrusted.example', false);
    }

    public function test_nonexistent_urls_return_404_and_functional_spa_routes_stay_available_without_indexing(): void
    {
        foreach (['/pagina-inexistente', '/sitemap-old.xml', '/destinos/inexistente'] as $path) {
            $this->get($path)->assertNotFound();
        }
        foreach (['/auth/confirm', '/checkout/example-reference', '/pt/search'] as $path) {
            $this->get($path)->assertOk()->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        }
    }

    public function test_editorial_content_is_escaped_in_html_and_jsonld(): void
    {
        config(['public_pages.destinos/caldas-novas.heading' => '</script><img src=x onerror=alert(1)>']);
        $this->get('/destinos/caldas-novas')->assertOk()
            ->assertDontSee('<img src=x', false)->assertSee('&lt;img', false)->assertSee('\\u003C', false);
    }
}
