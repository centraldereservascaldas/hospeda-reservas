<?php

namespace Tests\Feature;

use App\Models\AffiliateAccount;
use App\Services\AffiliateAttributionService;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysDiscoveryCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class AffiliateAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_user_can_request_access_but_cannot_self_approve(): void
    {
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'affiliate@example.test',
            'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Afiliado Exemplo'],
        ])]);
        $this->getJson('/api/affiliate/access')->assertUnauthorized();
        $this->withToken('test')->getJson('/api/affiliate/access')->assertOk()->assertJsonPath('status', 'none');
        $this->withToken('test')->postJson('/api/affiliate/access', ['status' => 'approved', 'referral_code' => 'chosen'])
            ->assertOk()->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('affiliate_accounts', ['user_id' => '575c8054-6646-443c-bf62-07945019a32f', 'status' => 'pending', 'referral_code' => null]);
        $this->withToken('test')->getJson('/api/affiliate/links/JQ08G')->assertForbidden();
        AffiliateAccount::query()->whereKey('575c8054-6646-443c-bf62-07945019a32f')->update(['status' => 'suspended']);
        $this->withToken('test')->postJson('/api/affiliate/access')->assertForbidden();
    }

    public function test_inactive_short_link_does_not_block_creating_an_active_replacement(): void
    {
        $id = '575c8054-6646-443c-bf62-07945019a32f';
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => $id, 'email' => 'affiliate@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Afiliado Exemplo'],
        ])]);
        AffiliateAccount::query()->create([
            'user_id' => $id, 'full_name' => 'Afiliado Exemplo', 'nickname' => 'afiliado-exemplo',
            'status' => 'approved', 'commission_basis_points' => 500,
        ]);
        DB::table('affiliate_short_links')->insert([
            'id' => (string) Str::uuid(), 'affiliate_user_id' => $id, 'token' => 'oldInactiveLink01',
            'listing_id' => 'JQ08G', 'status' => 'inactive', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->mock(StaysAccommodationCatalog::class)->shouldReceive('get')->once()->andReturn([
            'success' => true, 'data' => [['id' => 'JQ08G']],
        ]);

        $this->withToken('test')->getJson('/api/affiliate/links/JQ08G')->assertOk();

        $this->assertDatabaseCount('affiliate_short_links', 2);
        $this->assertDatabaseHas('affiliate_short_links', [
            'affiliate_user_id' => $id,
            'listing_id' => 'JQ08G',
            'status' => 'active',
        ]);
    }

    public function test_only_admin_can_approve_pending_affiliate_once(): void
    {
        $id = '575c8054-6646-443c-bf62-07945019a32f';
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key',
            'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        AffiliateAccount::query()->create(['user_id' => $id, 'full_name' => 'Afiliado Exemplo', 'status' => 'pending']);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => $id, 'email' => 'affiliate@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Afiliado Exemplo'],
        ])]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/approve", ['commissionBasisPoints' => 500])->assertForbidden();
        config(['services.hospeda.owner_admin_emails' => ['affiliate@example.test']]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/approve", ['commissionBasisPoints' => 10001])->assertUnprocessable();
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/approve", ['commissionBasisPoints' => 500])->assertOk();
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/approve", ['commissionBasisPoints' => 500])->assertStatus(409);
        $account = AffiliateAccount::query()->findOrFail($id);
        $this->assertSame('approved', $account->status);
        $this->assertSame(500, (int) $account->commission_basis_points);
        $this->assertSame(40, strlen($account->referral_code));
        $this->withToken('test')->getJson('/api/affiliate/access')->assertOk()
            ->assertJsonMissingPath('referralCode')
            ->assertJsonPath('commissionBasisPoints', 500)
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->mock(StaysAccommodationCatalog::class)->shouldReceive('get')->twice()->andReturn([
            'success' => true, 'data' => [['id' => 'JQ08G']], 'count' => 1, 'source' => 'test',
        ]);
        $this->mock(StaysDiscoveryCatalog::class)->shouldReceive('listing')->andReturn([
            'id' => 'JQ08G', 'slug' => 'imovel', 'name' => 'Imóvel', 'city' => 'Caldas Novas',
            'description' => 'Descrição', 'images' => [], 'indexable' => true,
        ]);
        $link = $this->withToken('test')->getJson('/api/affiliate/links/JQ08G')->assertOk()
            ->assertJsonPath('nickname', $account->nickname)->json('shortUrl');
        $this->withToken('test')->getJson('/api/affiliate/links/NOTFOUND')->assertNotFound();
        $this->get('/api/affiliate/capture')->assertNotFound();
        AffiliateAccount::query()->whereKey($id)->update(['status' => 'suspended']);
        AffiliateAccount::query()->whereKey($id)->update(['status' => 'approved']);
        $this->withToken('test')->getJson('/api/owner/admin/affiliates/approved')->assertOk()
            ->assertJsonPath('accounts.0.commission_basis_points', 500)
            ->assertJsonPath('accounts.0.nickname', $account->nickname);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/rate", ['commissionBasisPoints' => 700])->assertOk();
        $this->assertDatabaseHas('affiliate_accounts', ['user_id' => $id, 'commission_basis_points' => 700, 'referral_code' => $account->referral_code]);
    }

    public function test_admin_controls_affiliate_status_and_stops_clicks_for_excluded_listings(): void
    {
        $id = '575c8054-6646-443c-bf62-07945019a32f';
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => $id, 'email' => 'affiliate@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Afiliado Exemplo']])]);
        AffiliateAccount::query()->create(['user_id' => $id, 'full_name' => 'Afiliado Exemplo', 'status' => 'pending']);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/status", ['action' => 'reject'])->assertForbidden();
        $this->withToken('test')->postJson('/api/owner/admin/affiliate-listings/JQ08G', ['enabled' => false])->assertForbidden();
        config(['services.hospeda.owner_admin_emails' => ['affiliate@example.test']]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/status", ['action' => 'reject'])->assertOk();
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/status", ['action' => 'reactivate'])->assertStatus(409);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/status", ['action' => 'reconsider'])->assertOk()->assertJsonPath('status', 'pending');
        AffiliateAccount::query()->whereKey($id)->update(['status' => 'approved', 'referral_code' => str_repeat('A', 40)]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/status", ['action' => 'suspend'])->assertOk();
        $this->withToken('test')->getJson('/api/affiliate/dashboard')->assertForbidden();
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/status", ['action' => 'reactivate'])->assertOk();
        $this->assertDatabaseHas('affiliate_accounts', ['user_id' => $id, 'status' => 'approved', 'referral_code' => str_repeat('A', 40)]);
        $this->mock(StaysAccommodationCatalog::class)->shouldReceive('get')->andReturn(['data' => [['id' => 'JQ08G', 'title' => 'Primeiro'], ['id' => 'OTHER', 'title' => 'Segundo']]]);
        $this->withToken('test')->getJson('/api/affiliate/links/JQ08G')->assertOk();
        $existingToken = (string) DB::table('affiliate_short_links')->where('affiliate_user_id', $id)->value('token');
        $this->withToken('test')->getJson('/api/affiliate/catalog')->assertJsonCount(2, 'data');
        $this->withToken('test')->postJson('/api/owner/admin/affiliate-listings/JQ08G', ['enabled' => false])->assertOk();
        $this->withToken('test')->getJson('/api/affiliate/catalog')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', 'OTHER');
        $this->withToken('test')->getJson('/api/affiliate/links/JQ08G')->assertNotFound();
        $this->assertNull(app(AffiliateAttributionService::class)->recordClick(request(), $existingToken));
        $this->withToken('test')->getJson('/api/owner/admin/affiliate-listings')->assertJsonPath('listings.0.enabled', false);
        $this->withToken('test')->postJson('/api/owner/admin/affiliate-listings/JQ08G', ['enabled' => true])->assertOk();
        $this->withToken('test')->getJson('/api/affiliate/catalog')->assertJsonCount(2, 'data');
    }

    public function test_admin_can_navigate_all_affiliates_beyond_the_first_page(): void
    {
        $id = '575c8054-6646-443c-bf62-07945019a32f';
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => $id, 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Admin Exemplo']])]);
        foreach (range(1, 51) as $index) {
            AffiliateAccount::query()->create(['user_id' => sprintf('00000000-0000-4000-8000-%012d', $index), 'full_name' => 'Pessoa '.sprintf('%03d', $index), 'status' => 'pending']);
        }
        $this->withToken('test')->getJson('/api/owner/admin/affiliates?page=1')->assertOk()->assertJsonCount(50, 'accounts')->assertJsonPath('hasMore', true);
        $this->withToken('test')->getJson('/api/owner/admin/affiliates?page=2')->assertOk()->assertJsonCount(1, 'accounts')->assertJsonPath('hasMore', false);
        $this->withToken('test')->getJson('/api/owner/admin/affiliates?page=0')->assertUnprocessable();
        $this->withoutHeader('Authorization')->getJson('/api/owner/admin/affiliates?page=2')->assertUnauthorized();
    }

    public function test_reservation_pages_are_complete_and_isolated_by_affiliate(): void
    {
        $id = '575c8054-6646-443c-bf62-07945019a32f';
        $other = '6c2b1b31-c76e-4881-b11e-38f7d551b7a0';
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => $id, 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Admin Exemplo']])]);
        foreach ([$id, $other] as $affiliate) {
            AffiliateAccount::query()->create(['user_id' => $affiliate, 'full_name' => 'Afiliado Exemplo', 'status' => 'approved']);
        }
        foreach (range(1, 52) as $index) {
            $order = sprintf('00000000-0000-4000-9000-%012d', $index);
            DB::table('direct_booking_orders')->insert(['id' => $order, 'idempotency_key' => 'page-key-'.$index, 'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing-'.$index, 'stays_listing_id' => 'stays-'.$index, 'check_in' => '2027-01-01', 'check_out' => '2027-01-02', 'guests' => '[]', 'guest_name' => 'Guest Private', 'guest_email' => 'private@example.test', 'guest_phone' => '1234567890', 'quote_total' => '100.00', 'currency' => 'BRL', 'quote_snapshot' => '{}', 'accepted_terms_version' => 'v1', 'accepted_terms_snapshot' => '{}', 'terms_accepted_at' => now(), 'operational_events' => '[]', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('affiliate_conversions')->insert(['affiliate_user_id' => $index === 52 ? $other : $id, 'direct_booking_order_id' => $order, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->withToken('test')->getJson('/api/affiliate/dashboard?page=1')->assertOk()->assertJsonCount(50, 'conversions')->assertJsonPath('hasMore', true)->assertDontSee('private@example.test')->assertDontSee('listing-52');
        $this->withToken('test')->getJson('/api/affiliate/dashboard?page=2')->assertOk()->assertJsonCount(1, 'conversions')->assertJsonPath('hasMore', false)->assertDontSee('listing-52');
        $this->withToken('test')->getJson('/api/owner/admin/affiliate-commissions?page=1')->assertOk()->assertJsonCount(50, 'commissions')->assertJsonPath('hasMore', true);
        $this->withToken('test')->getJson('/api/owner/admin/affiliate-commissions?page=2')->assertOk()->assertJsonCount(2, 'commissions')->assertJsonPath('hasMore', false);
    }

    public function test_dashboard_requires_approval_and_only_shows_the_affiliates_own_conversions(): void
    {
        $id = '575c8054-6646-443c-bf62-07945019a32f';
        $other = '6c2b1b31-c76e-4881-b11e-38f7d551b7a0';
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => $id, 'email' => 'affiliate@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Afiliado Exemplo'],
        ])]);
        AffiliateAccount::query()->create(['user_id' => $id, 'full_name' => 'Afiliado Exemplo', 'status' => 'pending']);
        AffiliateAccount::query()->create(['user_id' => $other, 'full_name' => 'Outro Afiliado', 'status' => 'approved']);
        $this->withToken('test')->getJson('/api/affiliate/dashboard')->assertForbidden();
        AffiliateAccount::query()->whereKey($id)->update(['status' => 'approved']);
        foreach ([$id, $other] as $index => $affiliate) {
            $order = $index === 0 ? '62f03c01-e16a-4acf-817e-88f54cc62201' : '62f03c01-e16a-4acf-817e-88f54cc62202';
            DB::table('direct_booking_orders')->insert([
                'id' => $order, 'idempotency_key' => 'key-'.$index, 'request_fingerprint' => str_repeat('a', 64),
                'listing_id' => 'listing-'.$index, 'stays_listing_id' => 'stays-'.$index,
                'check_in' => '2027-01-01', 'check_out' => '2027-01-02', 'guests' => '[]',
                'guest_name' => 'Guest Private', 'guest_email' => 'private@example.test', 'guest_phone' => '1234567890',
                'quote_total' => '100.00', 'currency' => 'BRL', 'quote_snapshot' => '{}',
                'accepted_terms_version' => 'v1', 'accepted_terms_snapshot' => '{}', 'terms_accepted_at' => now(),
                'operational_events' => '[]', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('affiliate_conversions')->insert(['affiliate_user_id' => $affiliate, 'direct_booking_order_id' => $order,
                'commission_basis_points' => 350, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->withToken('test')->getJson('/api/affiliate/dashboard')->assertOk()
            ->assertJsonCount(1, 'conversions')->assertJsonPath('conversions.0.listing_id', 'listing-0')
            ->assertJsonPath('conversions.0.commission_status', 'pending')->assertDontSee('private@example.test');
        $conversionId = DB::table('affiliate_conversions')->where('affiliate_user_id', $id)->value('id');
        config(['services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        $approval = ['amountCents' => 1, 'reason' => 'Reserva validada pela equipe.'];
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", $approval)->assertForbidden();
        config(['services.hospeda.owner_admin_emails' => ['affiliate@example.test']]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", ['amountCents' => 5000])->assertUnprocessable();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", $approval)->assertStatus(409);
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'confirmado', 'reservation_status' => 'booked', 'check_in' => now()->subDays(2)->toDateString(),
                'check_out' => now()->subDay()->toDateString(), 'payment_status' => 'approved']);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", $approval)->assertStatus(409);
        $this->withToken('test')->getJson("/api/owner/admin/affiliate-commissions/{$conversionId}/events")
            ->assertOk()->assertJsonPath('events.1.type', 'approval_blocked')
            ->assertJsonPath('events.1.evidence.reasons.0', 'stay_not_completed');
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'concluido', 'check_out' => now()->toDateString()]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", $approval)->assertStatus(409);
        $this->withToken('test')->getJson("/api/owner/admin/affiliate-commissions/{$conversionId}/events")
            ->assertJsonPath('events.2.evidence.reasons.0', 'checkout_not_elapsed');
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['check_out' => now()->subDay()->toDateString()]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", $approval)->assertOk();
        $this->withToken('test')->getJson("/api/owner/admin/affiliate-commissions/{$conversionId}/events")
            ->assertJsonPath('events.3.type', 'approved')
            ->assertJsonPath('events.3.evidence.reason', 'Reserva validada pela equipe.')
            ->assertJsonPath('events.3.evidence.calculated_amount_cents', 350);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", $approval)->assertStatus(409);
        $this->withToken('test')->getJson('/api/affiliate/dashboard')->assertJsonPath('conversions.0.approved_amount_cents', 350);
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'reembolsado', 'payment_status' => 'refunded']);
        $this->withToken('test')->getJson('/api/affiliate/dashboard')
            ->assertJsonPath('conversions.0.commission_status', 'review')
            ->assertJsonPath('conversions.0.approved_amount_cents', null);
        $this->travel(2)->minutes();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", ['paymentReference' => 'pix-123'])->assertStatus(409);
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'concluido', 'reservation_status' => 'booked', 'check_in' => now()->subDays(2)->toDateString(),
                'check_out' => now()->subDay()->toDateString(), 'payment_status' => 'approved']);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", [])->assertUnprocessable();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", ['paymentReference' => 'pix-123'])->assertOk();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", ['paymentReference' => 'pix-123'])->assertStatus(409);
        $this->assertDatabaseHas('affiliate_conversions', ['id' => $conversionId, 'status' => 'paid', 'payment_reference' => 'pix-123']);
    }
}
