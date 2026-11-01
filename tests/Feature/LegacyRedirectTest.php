<?php

namespace Tests\Feature;

use App\Services\StaysDiscoveryCatalog;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class LegacyRedirectTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array', 'app.url' => 'https://centraldereservascaldas.com']);
    }

    public function test_legacy_urls_redirect_to_the_current_condominium_url(): void
    {
        $catalog = app(StaysDiscoveryCatalog::class);
        $properties = [];
        foreach (config('legacy_redirects.condominiums') as $id) {
            $properties[$id] = ['id' => $id, 'slug' => 'nome-atual', 'listingIds' => ['listing-1']];
        }
        Cache::put($catalog->key(), ['properties' => $properties, 'listings' => []], 300);

        foreach (config('legacy_redirects.condominiums') as $slug => $id) {
            $this->get('/'.$slug, ['Host' => 'untrusted.example'])->assertStatus(301)
                ->assertRedirect('https://centraldereservascaldas.com/condominios/'.$id.'/nome-atual');
        }
    }

    public function test_legacy_url_is_unavailable_without_a_catalog_or_active_accommodations(): void
    {
        $catalog = app(StaysDiscoveryCatalog::class);
        $this->get('/thermasplace')->assertStatus(503);
        Cache::put($catalog->key(), ['properties' => [], 'listings' => []], 300);
        $this->get('/thermasplace')->assertNotFound();
        Cache::put($catalog->key(), ['properties' => ['6a3560da78b17e1b6cffee9b' => ['listingIds' => []]], 'listings' => []], 300);
        $this->get('/thermasplace')->assertNotFound();
    }
}
