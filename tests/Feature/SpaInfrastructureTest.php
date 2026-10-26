<?php

namespace Tests\Feature;

use Tests\TestCase;

class SpaInfrastructureTest extends TestCase
{
    public function test_spa_deep_links_render_the_application(): void
    {
        $indexPath = public_path('index.html');
        $createdForTest = ! is_file($indexPath);
        if ($createdForTest) {
            file_put_contents($indexPath, '<!doctype html><html><head><title>Hospeda Reservas</title></head><body></body></html>');
        }

        try {
            foreach (['/', '/checkout/example-reference', '/reservar/JQ08G'] as $path) {
                $this->get($path)->assertOk()->assertHeader('content-type', 'text/html; charset=utf-8');
            }
        } finally {
            if ($createdForTest) {
                unlink($indexPath);
            }
        }
    }

    public function test_unapproved_dynamic_spa_routes_are_not_indexable(): void
    {
        $indexPath = public_path('index.html');
        $createdForTest = ! is_file($indexPath);
        if ($createdForTest) {
            file_put_contents($indexPath, '<!doctype html><html><head><title>Hospeda Reservas</title></head><body></body></html>');
        }

        try {
            foreach ([
                '/checkout/example-reference',
                '/checkout/example-reference/',
                '/reservar/JQ08G',
                '/reservar/JQ08G/',
                '/reservar/JQ08G/slug/',
                '/apartamento/JQ08G',
                '/apartamento/JQ08G/',
                '/en/apartment/JQ08G',
                '/en/apartment/JQ08G/',
            ] as $path) {
                $this->get($path)
                    ->assertOk()
                    ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
                    ->assertSee('<meta name="robots" content="noindex, nofollow" />', false);
            }

            $this->get('/')->assertOk()->assertHeaderMissing('X-Robots-Tag');
            $this->getJson('/api/health')->assertOk()->assertHeaderMissing('X-Robots-Tag');
            $this->getJson('/external/v1/content/listings')->assertOk()->assertHeaderMissing('X-Robots-Tag');
        } finally {
            if ($createdForTest) {
                unlink($indexPath);
            }
        }
    }

    public function test_approved_property_metadata_replaces_generic_tags_and_uses_configured_canonical_origin(): void
    {
        $this->withSpaIndex(<<<'HTML'
<!doctype html><html><head>
<title>Generic title</title>
<meta name="description" content="Generic description" />
<meta property="og:title" content="Generic title" />
<meta property="og:description" content="Generic description" />
<meta property="og:url" content="https://generic.example.test/" />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://generic.example.test/generic.jpg" />
<meta name="twitter:image" content="https://generic.example.test/generic.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Generic title" />
<meta name="twitter:description" content="Generic description" />
<link rel="canonical" href="https://generic.example.test/" />
</head><body></body></html>
HTML);
        config([
            'app.url' => 'https://reservas.example.test/base?configured=ignored',
            'property_metadata.listings.JQ08G' => [
                'approved' => true,
                'indexable' => true,
                'title' => 'Cabana <script>alert("x")</script> & vista',
                'description' => 'Acomodação "segura" com <img src=x onerror=alert(1)>.',
            ],
        ]);

        $response = $this->get('/en/apartment/JQ08G?host=https://injected.example.test', [
            'Host' => 'injected.example.test',
            'X-Forwarded-Host' => 'forwarded.example.test',
        ]);

        $response->assertOk()
            ->assertHeaderMissing('X-Robots-Tag')
            ->assertSee('<title>Cabana &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; vista</title>', false)
            ->assertSee('<meta name="description" content="Acomodação &quot;segura&quot; com &lt;img src=x onerror=alert(1)&gt;." />', false)
            ->assertSee('<link rel="canonical" href="https://reservas.example.test/apartamento/JQ08G" />', false)
            ->assertSee('<meta property="og:url" content="https://reservas.example.test/apartamento/JQ08G" />', false)
            ->assertSee('<meta name="twitter:card" content="summary" />', false)
            ->assertDontSee('<meta property="og:image"', false)
            ->assertDontSee('<meta name="twitter:image"', false)
            ->assertDontSee('Generic title', false)
            ->assertDontSee('injected.example.test', false)
            ->assertDontSee('forwarded.example.test', false)
            ->assertDontSee('configured=ignored', false)
            ->assertDontSee('<script>alert("x")</script>', false)
            ->assertDontSee('<img src=x onerror=alert(1)>', false);

        $this->assertSame(1, substr_count($response->getContent(), '<title>'));
        $this->assertSame(1, substr_count($response->getContent(), 'name="description"'));
        $this->assertSame(1, substr_count($response->getContent(), 'rel="canonical"'));

        foreach ([
            '/apartamento/JQ08G',
            '/apartamento/JQ08G/slug',
            '/en/apartment/JQ08G/slug/',
            '/pt/apartment/JQ08G/slug',
        ] as $path) {
            $variantResponse = $this->get($path);
            $variantResponse->assertOk()
                ->assertSee('<link rel="canonical" href="https://reservas.example.test/apartamento/JQ08G" />', false);
            $this->assertSame(1, substr_count($variantResponse->getContent(), 'rel="canonical"'));
        }
    }

    public function test_property_without_explicit_editorial_and_indexing_approval_remains_noindex(): void
    {
        $this->withSpaIndex('<!doctype html><html><head><title>Generic title</title><meta name="robots" content="index, follow"></head><body></body></html>');
        config(['property_metadata.listings' => [
            'JQ08G' => [
                'approved' => true,
                'title' => 'Approved title',
                'description' => 'Approved description.',
            ],
        ]]);

        $this->get('/pt/apartment/JQ08G/titulo-slug/?from=2026-12-01')
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertSee('<meta name="robots" content="noindex, nofollow" />', false)
            ->assertDontSee('content="index, follow"', false)
            ->assertDontSee('<link rel="canonical"', false)
            ->assertDontSee('<meta property="og:title"', false);
    }

    public function test_https_image_metadata_is_rendered_escaped_for_approved_property(): void
    {
        $this->withSpaIndex('<html><head><meta property="og:image" content="https://generic.example.test/generic.jpg"><meta name="twitter:image" content="https://generic.example.test/generic.jpg"></head><body></body></html>');
        config(['property_metadata.listings.JQ08G' => [
            'approved' => true,
            'indexable' => true,
            'title' => 'Approved title',
            'description' => 'Approved description.',
            'imageUrl' => 'https://cdn.example.test/property.jpg?size=large&crop=1',
        ]]);

        $response = $this->get('/apartamento/JQ08G');

        $response->assertOk()
            ->assertSee('<meta property="og:image" content="https://cdn.example.test/property.jpg?size=large&amp;crop=1" />', false)
            ->assertSee('<meta name="twitter:image" content="https://cdn.example.test/property.jpg?size=large&amp;crop=1" />', false)
            ->assertSee('<meta name="twitter:card" content="summary_large_image" />', false)
            ->assertDontSee('generic.jpg', false);
    }

    public function test_http_or_credentialed_social_image_urls_are_omitted(): void
    {
        $this->withSpaIndex('<html><head></head><body></body></html>');
        foreach ([
            'http://cdn.example.test/property.jpg',
            'https://user:password@cdn.example.test/property.jpg',
        ] as $imageUrl) {
            config(['property_metadata.listings.JQ08G' => [
                'approved' => true,
                'indexable' => true,
                'title' => 'Approved title',
                'description' => 'Approved description.',
                'imageUrl' => $imageUrl,
            ]]);

            $response = $this->get('/apartamento/JQ08G');
            $response->assertOk()
                ->assertSee('<meta name="twitter:card" content="summary" />', false)
                ->assertDontSee('og:image', false)
                ->assertDontSee('twitter:image', false);
        }
    }

    private function withSpaIndex(string $html): void
    {
        $indexPath = public_path('index.html');
        $createdForTest = ! is_file($indexPath);
        $original = $createdForTest ? null : file_get_contents($indexPath);
        file_put_contents($indexPath, $html);

        $this->beforeApplicationDestroyed(function () use ($indexPath, $createdForTest, $original): void {
            if ($createdForTest) {
                unlink($indexPath);

                return;
            }

            if (is_string($original)) {
                file_put_contents($indexPath, $original);
            }
        });
    }

    public function test_api_health_is_not_captured_by_the_spa_fallback(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJsonPath('success', true);
    }

    public function test_readiness_requires_database_while_liveness_does_not(): void
    {
        $this->getJson('/api/ready')->assertOk()->assertJsonPath('success', true);

        config(['database.default' => 'missing-readiness-connection']);
        $this->getJson('/api/health')->assertOk()->assertJsonPath('success', true);
        $this->getJson('/api/ready')
            ->assertServiceUnavailable()
            ->assertJsonPath('success', false)
            ->assertDontSee('missing-readiness-connection');
    }

    public function test_cors_allows_configured_origin_and_rejects_unknown_origin(): void
    {
        config(['cors.allowed_origins' => ['https://reservas.example.test']]);

        $this->withHeaders([
            'Origin' => 'https://reservas.example.test',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'content-type,x-checkout-resume-token',
        ])->options('/api/search')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'https://reservas.example.test');

        $this->flushHeaders();
        $response = $this->withHeaders([
            'Origin' => 'https://unknown.example.test',
            'Access-Control-Request-Method' => 'POST',
        ])->options('/api/search');
        $response->assertNoContent();
        $this->assertNotSame('https://unknown.example.test', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
