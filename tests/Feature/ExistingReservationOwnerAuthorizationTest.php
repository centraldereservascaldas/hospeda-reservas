<?php

namespace Tests\Feature;

use App\Services\StaysExternalApiClient;
use App\Services\SupabaseAuthClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExistingReservationOwnerAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(SupabaseAuthClient::class)
            ->shouldReceive('getUser')
            ->andReturn(['user' => [
                'id' => '575c8054-6646-443c-bf62-07945019a32f',
                'email' => 'guest@example.test',
                'email_confirmed_at' => '2026-01-01T00:00:00Z',
                'user_metadata' => ['full_name' => 'Guest Example'],
            ], 'error' => null]);
    }

    public function test_authenticated_reservation_owner_is_verified_against_the_stays_client_record(): void
    {
        $stays = $this->mock(StaysExternalApiClient::class);
        $stays->shouldReceive('get')->once()->with('/booking/reservations/ZY92K')->andReturn([
            'id' => 'ZY92K', '_idclient' => 'client-123',
        ]);
        $stays->shouldReceive('get')->once()->with('/booking/clients/client-123')->andReturn([
            '_id' => 'client-123', 'email' => ' GUEST@example.test ',
        ]);

        $this->withToken('valid-access-token')
            ->postJson('/api/existing-reservations/ZY92K/recovery-credential')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['credential']);
    }

    public function test_another_guest_cannot_access_a_reservation_summary(): void
    {
        $stays = $this->mock(StaysExternalApiClient::class);
        $stays->shouldReceive('get')->once()->with('/booking/reservations/ZY92K')->andReturn([
            'id' => 'ZY92K', '_idclient' => 'client-123',
        ]);
        $stays->shouldReceive('get')->once()->with('/booking/clients/client-123')->andReturn([
            '_id' => 'client-123', 'email' => 'other@example.test',
        ]);

        $this->withToken('valid-access-token')->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertNotFound()
            ->assertExactJson(['success' => false, 'message' => 'Reserva não encontrada.']);
    }

    public function test_reservation_endpoints_require_a_confirmed_supabase_session(): void
    {
        $this->withoutHeader('Authorization')
            ->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'authentication_required');
    }
}
