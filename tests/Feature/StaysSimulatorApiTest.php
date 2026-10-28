<?php

namespace Tests\Feature;

use Database\Seeders\StaysSimulatorSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StaysSimulatorApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.stays.client_id' => '',
            'services.stays.client_secret' => '',
            'services.stays_simulator.enabled' => true,
            'database.connections.stays_simulator.database' => ':memory:',
        ]);
        DB::purge('stays_simulator');
        $this->travelTo(now()->setDate(2026, 11, 2)->setTime(12, 0));
        Artisan::call('migrate', [
            '--database' => 'stays_simulator',
            '--path' => 'database/migrations/stays_simulator',
            '--force' => true,
        ]);
        app(StaysSimulatorSeeder::class)->run();
    }

    public function test_local_simulator_catalog_and_detail_are_marked_as_simulated(): void
    {
        $this->getJson('/api/accommodations')
            ->assertOk()
            ->assertJsonPath('source', 'stays-simulated')
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.simulatedData', true)
            ->assertJsonPath('data.0.dataSource', 'stays-simulated')
            ->assertJsonPath('data.0.isGuestFavorite', false);

        $this->getJson('/api/accommodations/JQ08G')
            ->assertOk()
            ->assertJsonPath('source', 'stays-simulated')
            ->assertJsonPath('data.simulatedData', true);
    }

    public function test_simulated_search_and_quote_use_date_specific_availability_and_rates(): void
    {
        $this->postJson('/api/search', [
            'from' => '2026-11-02',
            'to' => '2026-11-04',
            'guests' => 2,
        ])->assertOk()
            ->assertJsonPath('source', 'stays-simulated')
            ->assertJsonPath('from', '2026-11-02')
            ->assertJsonPath('to', '2026-11-04')
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.calculatedPrice.nights', 2);

        $this->postJson('/api/price', [
            'listingId' => 'JQ08G',
            'from' => '2026-11-02',
            'to' => '2026-11-04',
            'guests' => 2,
        ])->assertOk()
            ->assertJsonPath('source', 'stays-simulated')
            ->assertJsonPath('nights', 2)
            ->assertJsonPath('total', 851);
    }

    public function test_unavailable_simulated_dates_are_not_returned_or_quoted(): void
    {
        $this->postJson('/api/search', [
            'from' => '2026-11-14',
            'to' => '2026-11-16',
            'guests' => 2,
            'destination' => 'Lacqua DiRoma IV',
        ])->assertOk()
            ->assertJsonPath('source', 'stays-simulated')
            ->assertJsonCount(0, 'data');

        $this->postJson('/api/price', [
            'listingId' => 'JQ08G',
            'from' => '2026-11-14',
            'to' => '2026-11-16',
            'guests' => 2,
        ])->assertStatus(409)
            ->assertJsonPath('code', 'availability_unavailable');
    }

    public function test_simulated_calendar_returns_daily_availability_and_rate(): void
    {
        $this->getJson('/api/accommodations/JQ08G/calendar?from=2026-11-02&to=2026-11-04')
            ->assertOk()
            ->assertJsonPath('source', 'stays-simulated')
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.avail', 1)
            ->assertJsonPath('data.0.prices.0._mcval.BRL', 350);
    }

    public function test_simulator_setting_does_not_enable_it_outside_local_environments(): void
    {
        app()->instance('env', 'production');
        $this->getJson('/api/accommodations')
            ->assertServiceUnavailable()
            ->assertJsonPath('source', 'unavailable')
            ->assertJsonCount(0, 'data');
    }
}
