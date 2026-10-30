<?php

namespace Tests\Feature;

use Tests\TestCase;

class BlogDiscoveryTest extends TestCase
{
    public function test_sitemap_uses_only_relative_blog_routes_from_the_build_manifest(): void
    {
        config(['app.url' => 'https://centraldereservascaldas.com']);
        $path = public_path('blog/routes.json');
        $original = is_file($path) ? file_get_contents($path) : null;
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }
        file_put_contents($path, json_encode(['/blog/', '/blog/viagem-em-familia/', '/blog/categoria/familia/', '/blog/pagina/2/', 'https://untrusted.example/', '/checkout/private/', '/blog/../private/', '/blog/a?token=private', 123]));
        try {
            $this->get('/sitemap.xml')->assertOk()
                ->assertSee('https://centraldereservascaldas.com/blog/viagem-em-familia/', false)
                ->assertSee('https://centraldereservascaldas.com/blog/categoria/familia/', false)
                ->assertSee('https://centraldereservascaldas.com/blog/pagina/2/', false)
                ->assertDontSee('untrusted', false)->assertDontSee('private', false);
        } finally {
            if ($original === null) {
                unlink($path);
            } else {
                file_put_contents($path, $original);
            }
        }
    }

    public function test_blog_unknown_urls_are_404_even_when_spa_has_not_been_built(): void
    {
        $this->get('/blog/artigo-inexistente/')->assertNotFound();
        $this->get('/blog/categoria/inexistente/')->assertNotFound();
    }

    public function test_approved_property_has_readable_content_and_schema_in_initial_html(): void
    {
        config(['app.url' => 'https://centraldereservascaldas.com', 'property_metadata.listings.TEST' => [
            'approved' => true, 'indexable' => true,
            'title' => 'Apartamento aprovado <script>injection</script>', 'description' => 'Descrição editorial & condições confirmadas.',
        ]]);
        $path = public_path('index.html');
        $original = is_file($path) ? file_get_contents($path) : null;
        file_put_contents($path, '<html><head></head><body><div id="root"></div></body></html>');
        try {
            $this->get('/apartamento/TEST')->assertOk()->assertSee('Resumo da acomodação')
                ->assertSee('Descrição editorial &amp; condições confirmadas.', false)
                ->assertSee('id="public-property-schema"', false)
                ->assertSee('BreadcrumbList', false)->assertDontSee('<script>injection</script>', false);
        } finally {
            if ($original === null) {
                unlink($path);
            } else {
                file_put_contents($path, $original);
            }
        }
    }
}
