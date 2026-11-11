<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class InventoryAmbiguousReservationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_inventory_is_local_and_compares_codes_exactly(): void
    {
        Http::fake();
        $this->order('UNKNOWN');
        $this->order(str_repeat('A', 24));
        $this->order('ab12c');
        DB::table('stays_reservation_aliases')->insert(['canonical_id' => str_repeat('a', 24), 'reservation_code' => 'AB12C', 'created_at' => now(), 'updated_at' => now()]);
        $writes = [];
        DB::listen(function ($query) use (&$writes): void {
            if (preg_match('/^\s*(insert|update|delete|replace|alter|drop|create)\b/i', $query->sql)) {
                $writes[] = $query->sql;
            }
        });

        $this->artisan('checkout:inventory-ambiguous-reservations')
            ->expectsOutput('{"unresolved_orders":2,"aliases_available":true}')
            ->expectsOutput('Inventory only: no identity was verified or changed.')
            ->assertSuccessful();
        $this->assertSame([], $writes);
        Http::assertNothingSent();
        $this->assertDatabaseCount('stays_reservation_aliases', 1);
    }

    public function test_missing_alias_table_reports_all_noncanonical_references_as_unresolved(): void
    {
        $this->order('AB12C');
        $this->order(str_repeat('a', 24));
        Schema::drop('stays_reservation_aliases');
        $this->artisan('checkout:inventory-ambiguous-reservations')
            ->expectsOutput('{"unresolved_orders":1,"aliases_available":false}')
            ->assertSuccessful();
    }

    private function order(string $reference): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'idempotency_key' => uniqid('inventory-', true), 'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'LIST1', 'stays_listing_id' => 'LIST1',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13', 'guests' => [],
            'guest_name' => 'Test', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '300.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(),
            'stays_reservation_id' => $reference, 'operational_events' => [],
        ]);
    }
}
