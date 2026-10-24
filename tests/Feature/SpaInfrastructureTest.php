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
            file_put_contents($indexPath, '<!doctype html><title>Hospeda Reservas</title>');
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

    public function test_api_health_is_not_captured_by_the_spa_fallback(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJsonPath('success', true);
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
