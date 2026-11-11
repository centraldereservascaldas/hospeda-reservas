<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use App\Services\StaysExternalApiClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class InspectLegacyReservationTest extends TestCase
{
    use RefreshDatabase;

    public function test_inspection_uses_get_and_does_not_write_or_reveal_order_details(): void
    {
        $order = $this->order();
        $client = Mockery::mock(StaysExternalApiClient::class);
        $client->shouldReceive('get')->once()->with('/booking/reservations/AB12C')->andReturn([
            '_id' => str_repeat('a', 24), 'id' => 'AB12C', '_idlisting' => 'LIST1', '_idclient' => 'CLIENT1',
            'checkInDate' => '2026-11-10', 'checkOutDate' => '2026-11-13', 'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
        ]);
        $this->app->instance(StaysExternalApiClient::class, $client);
        $writes = [];
        DB::listen(function ($query) use (&$writes): void {
            if (preg_match('/^\s*(insert|update|delete|replace|alter|drop|create)\b/i', $query->sql)) {
                $writes[] = $query->sql;
            }
        });
        $this->artisan('checkout:inspect-legacy-reservation', ['order' => $order->id])
            ->expectsOutput('{"eligible_orders":1,"response_identity_valid":true,"order_identity_matches":true,"alias_conflicts":0}')
            ->assertSuccessful();
        $this->assertSame([], $writes);
        $this->assertDatabaseCount('stays_reservation_aliases', 0);
    }

    public function test_unavailable_response_is_inconclusive_and_fails(): void
    {
        $order = $this->order();
        $client = Mockery::mock(StaysExternalApiClient::class);
        $client->shouldReceive('get')->once()->with('/booking/reservations/AB12C')->andReturn(null);
        $this->app->instance(StaysExternalApiClient::class, $client);
        $this->artisan('checkout:inspect-legacy-reservation', ['order' => $order->id])
            ->expectsOutput('{"eligible_orders":1,"status":"inconclusive"}')
            ->assertFailed();
        $this->assertDatabaseCount('stays_reservation_aliases', 0);
    }

    public function test_conflicting_alias_is_counted(): void
    {
        $order = $this->order();
        DB::table('stays_reservation_aliases')->insert(['canonical_id' => str_repeat('b', 24), 'reservation_code' => 'AB12C', 'created_at' => now(), 'updated_at' => now()]);
        $this->fakeValidResponse($order);
        $this->artisan('checkout:inspect-legacy-reservation', ['order' => $order->id])
            ->expectsOutput('{"eligible_orders":1,"response_identity_valid":true,"order_identity_matches":true,"alias_conflicts":1}')
            ->assertSuccessful();
        $this->assertDatabaseCount('stays_reservation_aliases', 1);
    }

    public function test_missing_alias_table_is_reported_as_unknown(): void
    {
        $order = $this->order();
        Schema::drop('stays_reservation_aliases');
        $this->fakeValidResponse($order);
        $this->artisan('checkout:inspect-legacy-reservation', ['order' => $order->id])
            ->expectsOutput('{"eligible_orders":1,"response_identity_valid":true,"order_identity_matches":true,"alias_conflicts":null}')
            ->assertSuccessful();
    }

    private function fakeValidResponse(DirectBookingOrder $order): void
    {
        $client = Mockery::mock(StaysExternalApiClient::class);
        $client->shouldReceive('get')->once()->with('/booking/reservations/AB12C')->andReturn([
            '_id' => str_repeat('a', 24), 'id' => 'AB12C', '_idlisting' => 'LIST1', '_idclient' => 'CLIENT1',
            'checkInDate' => '2026-11-10', 'checkOutDate' => '2026-11-13', 'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
        ]);
        $this->app->instance(StaysExternalApiClient::class, $client);
    }

    private function order(): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'idempotency_key' => 'inspection-test', 'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'LIST1', 'stays_listing_id' => 'LIST1',
            'stays_client_id' => 'CLIENT1', 'check_in' => '2026-11-10', 'check_out' => '2026-11-13', 'guests' => [],
            'guest_name' => 'Private Name', 'guest_email' => 'private@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '300.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(),
            'stays_reservation_id' => 'AB12C', 'operational_events' => [],
        ]);
    }
}
