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
