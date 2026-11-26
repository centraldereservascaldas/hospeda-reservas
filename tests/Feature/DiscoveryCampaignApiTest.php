<?php

namespace Tests\Feature;

use App\Models\DiscoveryCampaign;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DiscoveryCampaignApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_empty_collection_when_no_campaigns_exist(): void
    {
        $response = $this->getJson('/api/discovery/campaigns');

        $response->assertOk()
            ->assertJsonPath('data', []);
    }

    public function test_returns_only_active_and_future_campaigns(): void
    {
        // Future active campaign within display window
        $active = DiscoveryCampaign::factory()->create([
            'slug' => 'caldas-country-2027',
            'title' => 'Caldas Country Festival 2027',
            'eyebrow' => 'CALDAS COUNTRY',
            'description' => 'Ingressos e hospedagens exclusivas para o festival em Caldas Novas.',
            'check_in' => now()->addDays(30)->format('Y-m-d'),
            'check_out' => now()->addDays(33)->format('Y-m-d'),
            'kind' => 'event',
            'is_active' => true,
            'weight' => 10,
            'display_from' => now()->subDays(2)->format('Y-m-d'),
            'display_until' => now()->addDays(20)->format('Y-m-d'),
        ]);

        // Inactive campaign (should NOT appear)
        DiscoveryCampaign::factory()->create([
            'slug' => 'inactive-campaign',
            'check_in' => now()->addDays(30)->format('Y-m-d'),
            'is_active' => false,
        ]);

        // Past campaign (check_in in the past, should NOT appear)
        DiscoveryCampaign::factory()->create([
            'slug' => 'past-campaign',
            'check_in' => now()->subDays(5)->format('Y-m-d'),
            'check_out' => now()->subDays(2)->format('Y-m-d'),
            'is_active' => true,
        ]);

        // Future campaign but display_from is in the future (should NOT appear yet)
        DiscoveryCampaign::factory()->create([
            'slug' => 'early-campaign',
            'check_in' => now()->addDays(60)->format('Y-m-d'),
            'is_active' => true,
            'display_from' => now()->addDays(10)->format('Y-m-d'),
        ]);

        // Future campaign but display_until is in the past (should NOT appear anymore)
        DiscoveryCampaign::factory()->create([
            'slug' => 'expired-display-campaign',
            'check_in' => now()->addDays(30)->format('Y-m-d'),
            'is_active' => true,
            'display_until' => now()->subDay()->format('Y-m-d'),
        ]);

        $response = $this->getJson('/api/discovery/campaigns');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment([
                'id' => 'caldas-country-2027',
                'title' => 'Caldas Country Festival 2027',
                'eyebrow' => 'CALDAS COUNTRY',
                'kind' => 'event',
                'weight' => 10,
            ]);
    }
}
