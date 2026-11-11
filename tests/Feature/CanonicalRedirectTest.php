<?php

namespace Tests\Feature;

use Tests\TestCase;

class CanonicalRedirectTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://centraldereservascaldas.com']);
    }

    public function test_alternate_host_redirects_public_routes_and_preserves_query(): void
    {
        foreach (['/', '/condominios', '/destinos/caldas-novas', '/guias/viagem', '/sitemap.xml', '/pagina-inexistente'] as $path) {
            $this->get('https://www.centraldereservascaldas.com'.$path.'?utm_source=teste&ref=a%2Fb')
                ->assertMovedPermanently()
                ->assertRedirect('https://centraldereservascaldas.com'.$path.'?utm_source=teste&ref=a%2Fb');
        }
    }

    public function test_canonical_host_does_not_redirect_to_itself(): void
    {
        $this->get('https://centraldereservascaldas.com/robots.txt')->assertOk();
    }

    public function test_unlisted_host_is_not_redirected(): void
    {
        $this->get('https://other.example/robots.txt')->assertOk();
    }

    public function test_legacy_search_path_redirects_with_query_parameters(): void
    {
        $this->get('https://centraldereservascaldas.com/mapas-lacqua-diroma?utm_source=teste')
            ->assertMovedPermanently()
            ->assertRedirect('/?destination=diroma&utm_source=teste');
    }

    public function test_unknown_path_returns_noindex_404_with_the_application_shell(): void
    {
        $indexPath = public_path('index.html');
        $createdForTest = ! is_file($indexPath);
        if ($createdForTest) {
            file_put_contents($indexPath, '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
        }

        try {
            $this->get('https://centraldereservascaldas.com/pagina-inexistente')
                ->assertNotFound()
                ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
                ->assertSee('name="robots" content="noindex, nofollow"', false)
                ->assertSee('id="root"', false);
        } finally {
            if ($createdForTest) {
                unlink($indexPath);
            }
        }
    }

    public function test_api_requests_and_mutating_requests_are_not_canonicalized(): void
    {
        $this->get('https://www.centraldereservascaldas.com/api/health')->assertOk();
        $this->post('https://www.centraldereservascaldas.com/external/v1/book-request')->assertStatus(410);
    }
}
