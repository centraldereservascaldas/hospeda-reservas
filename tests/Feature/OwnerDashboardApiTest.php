<?php

namespace Tests\Feature;

use App\Models\OwnerAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OwnerDashboardApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_includes_canceled_reservations_without_exposing_guest_contact_details(): void
    {
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.base_url' => 'https://crcn.stays.net/external/v1',
        ]);
        Http::preventStrayRequests();
        Http::fake(function (ClientRequest $request) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return match (true) {
                $path === '/auth/v1/user' => Http::response([
                    'id' => '575c8054-6646-443c-bf62-07945019a32f',
                    'email' => 'owner@example.test',
                    'email_confirmed_at' => '2026-01-01T00:00:00Z',
                    'user_metadata' => ['full_name' => 'Owner Example'],
                ]),
                $path === '/external/v1/finance/owners' => Http::response([[
                    '_id' => 'owner-1',
                    'name' => 'Owner Example',
                    'listings' => [['_id' => 'listing-object-1', 'id' => 'OH01J']],
                ]]),
                $path === '/external/v1/finance/owners/owner-1/listing-object-1' => Http::response([
                    '_id' => 'listing-object-1',
                    'id' => 'OH01J',
                    'accounts' => [],
                ]),
                $path === '/external/v1/booking/reservations' && ($query['type'] ?? null) === 'canceled' => Http::response([[
                    '_id' => 'reservation-canceled-1',
                    'id' => 'QI03J',
                    '_idlisting' => 'OH01J',
                    'type' => 'canceled',
                    'checkInDate' => '2026-10-12',
                    'checkOutDate' => '2026-10-15',
                    'client' => ['name' => 'Guest Example', 'email' => 'guest-private@example.test', 'phone' => '+5511999999999'],
                    'price' => ['_f_total' => 300],
                ]]),
                $path === '/external/v1/booking/reservations' => Http::response([]),
                default => Http::response(['unexpected_request' => $path], 500),
            };
        });

        OwnerAccess::query()->create([
            'user_id' => '575c8054-6646-443c-bf62-07945019a32f',
            'full_name' => 'Owner Example',
            'stays_owner_id' => 'owner-1',
            'status' => 'approved',
        ]);

        $response = $this->withToken('valid-access-token')
            ->getJson('/api/owner/dashboard?from=2026-10-01&to=2026-10-31');

        $response->assertOk()
            ->assertJsonPath('reservations.0.id', 'reservation-canceled-1')
            ->assertJsonPath('reservations.0.status', 'cancelled')
            ->assertJsonMissingPath('reservations.0.guestEmail')
            ->assertDontSee('guest-private@example.test')
            ->assertDontSee('+5511999999999');

        Http::assertSent(function (ClientRequest $request): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return parse_url($request->url(), PHP_URL_PATH) === '/external/v1/booking/reservations'
                && ($query['type'] ?? null) === 'canceled'
                && ($query['listingId'] ?? null) === 'OH01J';
        });
    }
}
