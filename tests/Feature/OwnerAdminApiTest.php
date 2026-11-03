<?php

namespace Tests\Feature;

use App\Models\OwnerAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OwnerAdminApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewer_can_review_owners_but_cannot_access_payment_operations(): void
    {
        $reviewerId = '575c8054-6646-443c-bf62-07945019a32f';
        $ownerId = '6c2b1b31-c76e-4881-b11e-38f7d551b7a0';
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.hospeda.owner_admin_emails' => [],
            'services.hospeda.owner_reviewer_emails' => ['ricardofanty@gmail.com'],
        ]);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => $reviewerId,
            'email' => 'ricardofanty@gmail.com',
            'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Revisor Central'],
        ], 200)]);
        OwnerAccess::query()->create(['user_id' => $ownerId, 'full_name' => 'Proprietário', 'status' => 'pending']);

        $this->withToken('valid-access-token')->getJson('/api/owner/admin/status')
            ->assertOk()->assertJsonPath('isAdmin', true)->assertJsonPath('canManagePayments', false);
        $this->withToken('valid-access-token')->getJson('/api/owner/admin/requests')
            ->assertOk()->assertJsonPath('requests.0.userId', $ownerId);
        $this->withToken('valid-access-token')->getJson('/api/owner/admin/direct-booking-orders')
            ->assertStatus(503)->assertJsonPath('code', 'owner_admin_not_configured');
        $this->withToken('valid-access-token')->postJson('/api/owner/admin/approve', [])
            ->assertUnprocessable();
        $this->withToken('valid-access-token')->postJson('/api/owner/admin/reject', ['userId' => $ownerId])
            ->assertOk()->assertJsonPath('status', 'rejected');
        $this->assertDatabaseHas('owner_access', [
            'user_id' => $ownerId,
            'status' => 'rejected',
            'reviewed_by' => $reviewerId,
        ]);
        $this->withToken('valid-access-token')->postJson('/api/owner/admin/reject', ['userId' => $ownerId])
            ->assertStatus(409);
    }

    public function test_owner_search_splits_history_into_supported_stays_ranges_and_reuses_the_directory(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 16)->setTime(12, 0));
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.hospeda.owner_admin_emails' => ['admin@example.test'],
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.base_url' => 'https://crcn.stays.net/external/v1',
            'cache.default' => 'array',
        ]);
        Cache::forget('stays.owner_directory.v1');
        Http::preventStrayRequests();
        $requestedRanges = [];
        Http::fake([
            '*/auth/v1/user' => Http::response([
                'id' => '575c8054-6646-443c-bf62-07945019a32f',
                'email' => 'admin@example.test',
                'email_confirmed_at' => '2026-01-01T00:00:00Z',
                'user_metadata' => ['full_name' => 'Admin Central'],
            ], 200),
            '*/finance/owners*' => function (ClientRequest $request) use (&$requestedRanges) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                $requestedRanges[] = $query;
                $owners = [['id' => 'owner-ricardo', 'name' => 'Ricardo Silva']];
                if ($query['from'] >= '2019-01-01' && $query['from'] <= '2020-12-31') {
                    $owners[] = ['id' => 'owner-rita', 'name' => 'Rita Souza'];
                }

                return Http::response($owners, 200);
            },
        ]);

        $response = $this->withToken('valid-access-token')->getJson('/api/owner/admin/stays-owners?q=ri');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('total', 2)
            ->assertJsonCount(2, 'owners');
        $this->withToken('valid-access-token')->getJson('/api/owner/admin/stays-owners?q=ri')->assertOk();
        $this->assertCount(11, $requestedRanges);
        $this->assertSame('2016-01-01', $requestedRanges[0]['from']);
        $this->assertSame('2026-10-16', $requestedRanges[count($requestedRanges) - 1]['to']);
        foreach ($requestedRanges as $index => $range) {
            $from = new \DateTimeImmutable($range['from']);
            $to = new \DateTimeImmutable($range['to']);
            $this->assertLessThanOrEqual(364, (int) $from->diff($to)->format('%a'));
            if ($index > 0) {
                $previousDay = new \DateTimeImmutable($requestedRanges[$index - 1]['to']);
                $this->assertSame($previousDay->modify('+1 day')->format('Y-m-d'), $range['from']);
            }
        }
    }

    public function test_owner_search_returns_502_when_a_stays_history_window_cannot_be_loaded(): void
    {
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.hospeda.owner_admin_emails' => ['admin@example.test'],
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.base_url' => 'https://crcn.stays.net/external/v1',
        ]);
        Cache::forget('stays.owner_directory.v1');
        Http::preventStrayRequests();
        Http::fake([
            '*/auth/v1/user' => Http::response([
                'id' => '575c8054-6646-443c-bf62-07945019a32f',
                'email' => 'admin@example.test',
                'email_confirmed_at' => '2026-01-01T00:00:00Z',
                'user_metadata' => ['full_name' => 'Admin Central'],
            ], 200),
            '*/finance/owners*' => Http::response(['message' => 'Unavailable window'], 422),
        ]);

        $this->withToken('valid-access-token')->getJson('/api/owner/admin/stays-owners?q=ri')
            ->assertStatus(502)
            ->assertJsonPath('code', 'stays_owners_unavailable');
    }
}
