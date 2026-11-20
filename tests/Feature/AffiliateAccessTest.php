<?php

namespace Tests\Feature;

use App\Models\AffiliateAccount;
use App\Services\StaysAccommodationCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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
            ->assertJsonPath('referralCode', $account->referral_code)
            ->assertJsonPath('commissionBasisPoints', 500)
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->mock(StaysAccommodationCatalog::class)->shouldReceive('get')->twice()->andReturn([
            'success' => true, 'data' => [['id' => 'JQ08G']], 'count' => 1, 'source' => 'test',
        ]);
        $this->withToken('test')->getJson('/api/affiliate/links/JQ08G')->assertOk()
            ->assertJsonPath('signature', hash_hmac('sha256', $account->referral_code.':JQ08G', (string) config('app.key')));
        $this->withToken('test')->getJson('/api/affiliate/links/NOTFOUND')->assertNotFound();
        $click = ['referral' => $account->referral_code, 'listingId' => 'JQ08G', 'signature' => hash_hmac('sha256', $account->referral_code.':JQ08G', (string) config('app.key'))];
        $captured = $this->postJson('/api/affiliate/capture', $click)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $transfer = ['referral' => $account->referral_code, 'listingId' => 'JQ08G', 'issuedAt' => $captured->json('issuedAt'), 'signature' => $captured->json('signature')];
        $this->travel(10)->days();
        $this->postJson('/api/affiliate/capture', $transfer)->assertOk()->assertJsonPath('issuedAt', $transfer['issuedAt'])->assertJsonPath('signature', $transfer['signature']);
        $this->travel(20)->days();
        $this->postJson('/api/affiliate/capture', $transfer)->assertForbidden();
        $this->travel(-30)->days();
        $this->postJson('/api/affiliate/capture', array_merge($click, ['listingId' => 'OTHER']))->assertForbidden();
        AffiliateAccount::query()->whereKey($id)->update(['status' => 'suspended']);
        $this->postJson('/api/affiliate/capture', $click)->assertForbidden();
        AffiliateAccount::query()->whereKey($id)->update(['status' => 'approved']);
        $this->withToken('test')->getJson('/api/owner/admin/affiliates/approved')->assertOk()
            ->assertJsonPath('accounts.0.commission_basis_points', 500);
        $this->withToken('test')->postJson("/api/owner/admin/affiliates/{$id}/rate", ['commissionBasisPoints' => 700])->assertOk();
        $this->assertDatabaseHas('affiliate_accounts', ['user_id' => $id, 'commission_basis_points' => 700, 'referral_code' => $account->referral_code]);
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
                'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->withToken('test')->getJson('/api/affiliate/dashboard')->assertOk()
            ->assertJsonCount(1, 'conversions')->assertJsonPath('conversions.0.listing_id', 'listing-0')
            ->assertJsonPath('conversions.0.commission_status', 'pending')->assertDontSee('private@example.test');
        $conversionId = DB::table('affiliate_conversions')->where('affiliate_user_id', $id)->value('id');
        config(['services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", ['amountCents' => 5000])->assertForbidden();
        config(['services.hospeda.owner_admin_emails' => ['affiliate@example.test']]);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", ['amountCents' => 5000])->assertStatus(409);
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'confirmado', 'payment_status' => 'approved']);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", ['amountCents' => 5000])->assertOk();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/approve", ['amountCents' => 5000])->assertStatus(409);
        $this->withToken('test')->getJson('/api/affiliate/dashboard')->assertJsonPath('conversions.0.approved_amount_cents', 5000);
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'reembolsado', 'payment_status' => 'refunded']);
        $this->withToken('test')->getJson('/api/affiliate/dashboard')
            ->assertJsonPath('conversions.0.commission_status', 'review')
            ->assertJsonPath('conversions.0.approved_amount_cents', null);
        $this->travel(2)->minutes();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", ['paymentReference' => 'pix-123'])->assertStatus(409);
        DB::table('direct_booking_orders')->where('id', '62f03c01-e16a-4acf-817e-88f54cc62201')
            ->update(['status' => 'confirmado', 'payment_status' => 'approved']);
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", [])->assertUnprocessable();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", ['paymentReference' => 'pix-123'])->assertOk();
        $this->withToken('test')->postJson("/api/owner/admin/affiliate-commissions/{$conversionId}/mark-paid", ['paymentReference' => 'pix-123'])->assertStatus(409);
        $this->assertDatabaseHas('affiliate_conversions', ['id' => $conversionId, 'status' => 'paid', 'payment_reference' => 'pix-123']);
    }
}
