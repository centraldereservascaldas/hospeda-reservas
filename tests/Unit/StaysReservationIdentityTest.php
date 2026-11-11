<?php

namespace Tests\Unit;

use App\Models\DirectBookingOrder;
use App\Services\StaysExternalApiClient;
use App\Services\StaysReservationIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StaysReservationIdentityTest extends TestCase
{
    use RefreshDatabase;

    public function test_short_and_canonical_identifiers_resolve_to_the_same_identity_outside_a_transaction(): void
    {
        $id = 'abcdefabcdefabcdefabcdef';
        $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->twice()->andReturnUsing(function ($endpoint) use ($id) {
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            $this->assertContains($endpoint, ['/booking/reservations/ZX91K', '/booking/reservations/'.$id]);

            return ['_id' => $id, 'id' => 'ZX91K'];
        });
        $identity = app(StaysReservationIdentity::class);
        $this->assertSame(['canonical' => $id, 'code' => 'ZX91K'], $identity->resolve('ZX91K'));
        $this->assertSame(['canonical' => $id, 'code' => 'ZX91K'], $identity->resolve($id));
    }

    public function test_unverified_or_mismatched_identity_is_rejected(): void
    {
        $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->once()->andReturn([
            '_id' => 'abcdefabcdefabcdefabcdef', 'id' => 'OTHER',
        ]);
        $identity = app(StaysReservationIdentity::class);
        $this->assertNull($identity->resolve('ZX91K'));
        $this->assertNull($identity->resolve('../bad'));
    }

    public function test_conflicting_previously_verified_alias_is_never_overwritten(): void
    {
        $identity = app(StaysReservationIdentity::class);
        $this->assertTrue($identity->remember(['canonical' => str_repeat('a', 24), 'code' => 'ZX91K']));
        $this->assertFalse($identity->remember(['canonical' => str_repeat('b', 24), 'code' => 'ZX91K']));
        $this->assertFalse($identity->remember(['canonical' => str_repeat('a', 24), 'code' => 'AB12C']));
        $this->assertDatabaseCount('stays_reservation_aliases', 1);
    }

    public function test_legacy_identity_requires_order_correlation_client_listing_and_dates(): void
    {
        $order = new DirectBookingOrder;
        $order->forceFill(['id' => 'legacy-order', 'stays_reservation_id' => 'ZX91K', 'stays_client_id' => 'client', 'stays_listing_id' => 'listing', 'check_in' => '2026-11-19', 'check_out' => '2026-11-21']);
        $record = ['_id' => str_repeat('a', 24), 'id' => 'ZX91K', '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2026-11-19', 'checkOutDate' => '2026-11-21', 'internalNote' => 'CRCN_DIRECT_ORDER:legacy-order'];
        $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->twice()->andReturn($record, [...$record, '_idclient' => 'different-client']);
        $identity = app(StaysReservationIdentity::class);
        $this->assertSame(['canonical' => str_repeat('a', 24), 'code' => 'ZX91K'], $identity->resolveForLegacyOrder($order));
        $this->assertNull($identity->resolveForLegacyOrder($order));
    }
}
