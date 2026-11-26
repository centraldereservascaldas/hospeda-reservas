<?php

namespace Tests\Feature;

use App\Http\Controllers\AffiliateRedirectController;
use App\Models\AffiliateAccount;
use App\Services\AffiliateAttributionService;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

class AffiliateShortLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_approved_affiliate_can_get_a_stable_short_link_and_record_clicks(): void
    {
        $affiliateId = (string) Str::uuid();
        $this->createAffiliate($affiliateId);
        $this->actingAsVerifiedAffiliate($affiliateId);
        $this->mock(StaysAccommodationCatalog::class)->shouldReceive('get')->twice()->andReturn([
            'success' => true,
            'data' => [['id' => 'JQ08G']],
        ]);
        $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('listing')->andReturn([
            'id' => 'JQ08G', 'slug' => 'imovel', 'name' => 'Imóvel', 'city' => 'Caldas Novas',
            'description' => 'Descrição', 'images' => [], 'indexable' => true,
        ]);

        $firstLinkResponse = $this->getJson('/api/affiliate/links/JQ08G')
            ->assertOk()
            ->assertJsonPath('nickname', 'afiliado-exemplo');
        $shortUrl = $firstLinkResponse->json('shortUrl');
        $this->assertMatchesRegularExpression('#^'.preg_quote(url('/a/'), '#').'\/[A-Za-z0-9]{24}$#', $shortUrl);
        $token = (string) DB::table('affiliate_short_links')->where('affiliate_user_id', $affiliateId)->value('token');
        $this->assertSame('affiliate.redirect', Route::getRoutes()->match(Request::create('/a/'.$token, 'GET'))->getName());
        $this->assertSame($shortUrl, $this->getJson('/api/affiliate/links/JQ08G')->json('shortUrl'));

        $redirect = (new AffiliateRedirectController)->__invoke(request(), $token, app(AffiliateAttributionService::class));
        $this->assertSame('http://localhost/apartamento/JQ08G', $redirect->getTargetUrl());
        $this->assertSame('no-store, private', $redirect->headers->get('Cache-Control'));
        $this->assertSame('no-referrer', $redirect->headers->get('Referrer-Policy'));
        $cookie = $redirect->headers->getCookies()[0];
        $this->assertSame(AffiliateAttributionService::COOKIE_NAME, $cookie->getName());
        $this->assertSame(7 * 24 * 60 * 60, $cookie->getMaxAge());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertDatabaseCount('affiliate_clicks', 1);
        $attribution = DB::table('affiliate_attributions')->where('affiliate_user_id', $affiliateId)->first();
        $this->assertNotNull($attribution);
        $this->assertSame(now()->addDays(7)->toDateTimeString(), $attribution->expires_at);
    }

    public function test_last_valid_click_replaces_the_affiliate_and_restarts_seven_day_window(): void
    {
        $firstAffiliate = (string) Str::uuid();
        $lastAffiliate = (string) Str::uuid();
        $this->createAffiliate($firstAffiliate);
        AffiliateAccount::query()->create([
            'user_id' => $lastAffiliate,
            'full_name' => 'Segundo Afiliado',
            'nickname' => 'segundo-afiliado',
            'status' => 'approved',
            'commission_basis_points' => 500,
        ]);
        $firstToken = $this->createLink($firstAffiliate);
        $lastToken = $this->createLink($lastAffiliate);

        $firstClick = app(AffiliateAttributionService::class)->recordClick(request(), $firstToken);
        $this->assertNotNull($firstClick);
        $this->travel(2)->days();
        $request = request();
        $request->cookies->set(AffiliateAttributionService::COOKIE_NAME, $firstClick['attributionId']);
        $lastClick = app(AffiliateAttributionService::class)->recordClick($request, $lastToken);

        $this->assertSame($firstClick['attributionId'], $lastClick['attributionId']);
        $this->assertDatabaseHas('affiliate_attributions', [
            'id' => $firstClick['attributionId'],
            'affiliate_user_id' => $lastAffiliate,
            'affiliate_short_link_id' => DB::table('affiliate_short_links')->where('token', $lastToken)->value('id'),
            'expires_at' => now()->addDays(7)->toDateTimeString(),
        ]);
        $this->assertDatabaseCount('affiliate_clicks', 2);
    }

    public function test_expired_attribution_and_suspended_or_excluded_links_cannot_receive_conversion(): void
    {
        $affiliateId = (string) Str::uuid();
        $this->createAffiliate($affiliateId);
        $token = $this->createLink($affiliateId);
        $service = app(AffiliateAttributionService::class);
        AffiliateAccount::query()->whereKey($affiliateId)->update(['status' => 'suspended']);
        $this->assertNull($service->recordClick(request(), $token));
        AffiliateAccount::query()->whereKey($affiliateId)->update(['status' => 'approved']);
        $click = $service->recordClick(request(), $token);
        $this->assertNotNull($click);

        $this->travel(8)->days();
        $this->assertFalse($service->recordConversion($click['attributionId'], ['JQ08G'], (string) Str::uuid()));
        $this->assertNull($service->recordClick(request(), 'not-exist0'));

        $this->travelBack();
        DB::table('affiliate_listing_exclusions')->insert(['listing_id' => 'JQ08G', 'updated_by' => $affiliateId, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertNull($service->recordClick(request(), $token));
        $this->assertDatabaseCount('affiliate_clicks', 1);
    }

    public function test_production_attribution_cookie_is_secure(): void
    {
        $affiliateId = (string) Str::uuid();
        $this->createAffiliate($affiliateId);
        $token = $this->createLink($affiliateId);
        $this->app->detectEnvironment(fn (): string => 'production');

        $response = (new AffiliateRedirectController)->__invoke(request(), $token, app(AffiliateAttributionService::class));

        $this->assertTrue($response->headers->getCookies()[0]->isSecure());
    }

    private function createAffiliate(string $id): void
    {
        AffiliateAccount::query()->create([
            'user_id' => $id,
            'full_name' => 'Afiliado Exemplo',
            'nickname' => 'afiliado-exemplo',
            'status' => 'approved',
            'commission_basis_points' => 500,
        ]);
    }

    private function createLink(string $affiliateId): string
    {
        $token = Str::random(24);
        DB::table('affiliate_short_links')->insert([
            'id' => (string) Str::uuid(),
            'affiliate_user_id' => $affiliateId,
            'token' => $token,
            'listing_id' => 'JQ08G',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $token;
    }

    private function actingAsVerifiedAffiliate(string $id): void
    {
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => $id,
            'email' => 'affiliate@example.test',
            'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Afiliado Exemplo'],
        ])]);
        $this->withToken('test');
    }
}
