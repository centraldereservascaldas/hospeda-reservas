<?php

namespace Tests\Feature;

use App\Services\StaysExternalApiClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExistingReservationOwnerAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_summary_can_be_opened_without_supabase_authentication(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $stays = $this->mock(StaysExternalApiClient::class);
        $stays->shouldReceive('get')->once()->with('/booking/reservations/ZY92K')->andReturn(null);

        $this->withoutHeader('Authorization')
            ->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertServiceUnavailable()
            ->assertJsonPath('success', false);
    }

    public function test_checkout_recovery_uses_short_code_without_login_and_requires_its_secret(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        $this->withoutHeader('Authorization')
            ->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertUnprocessable();
    }
}
