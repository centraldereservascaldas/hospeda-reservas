<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\ExperimentalLegacyReservationEvidence;
use App\Services\ExistingReservationPaymentLock;
use App\Services\ReservationReleaseGuard;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class ExperimentalLegacyReservationEvidenceTest extends TestCase
{
    private string $orderId;

    private string $reference;

    private string $canonical;

    private string $competingCanonical;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('migrate');
        $this->orderId = (string) Str::uuid();
        $this->reference = strtoupper(substr(str_replace('-', '', $this->orderId), 0, 5));
        $this->canonical = substr(str_replace('-', '', (string) Str::uuid()), 0, 24);
        $this->competingCanonical = substr(str_replace('-', '', (string) Str::uuid()), 0, 24);
        config(['services.stays.base_url' => 'https://stays.example.test', 'services.stays.client_id' => 'test-account', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
    }

    protected function tearDown(): void
    {
        DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $this->orderId)->delete();
        DirectBookingOrder::query()->whereKey($this->orderId)->delete();
        DB::table('existing_reservation_payment_locks')->whereIn('stays_reservation_id', [$this->canonical, $this->competingCanonical])->delete();
        parent::tearDown();
    }

    public function test_capture_is_idempotent_and_uses_only_a_get_outside_a_transaction(): void
    {
        $order = $this->order();
        Http::fake(function (Request $request) use ($order) {
            $this->assertSame(0, DB::transactionLevel());
            $this->assertSame('GET', $request->method());
            $this->assertStringEndsWith('/booking/reservations/'.$this->reference, $request->url());

            return Http::response($this->reservation($order));
        });
        $service = app(ExperimentalLegacyReservationEvidence::class);
        $this->assertTrue($service->capture($order->id));
        $this->assertTrue($service->capture($order->id));
        $this->assertSame(1, DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $order->id)->count());
        $this->assertDatabaseHas('legacy_reservation_order_evidence', ['direct_booking_order_id' => $order->id, 'canonical_id' => $this->canonical]);
        $this->assertSame($this->reference, $order->fresh()->stays_reservation_id);
    }

    public function test_modified_order_during_get_fails_closed(): void
    {
        $order = $this->order();
        Http::fake(function () use ($order) {
            DirectBookingOrder::query()->whereKey($order->id)->update(['stays_client_id' => 'changed']);

            return Http::response($this->reservation($order));
        });
        $this->assertFalse(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));
        $this->assertSame(0, DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $order->id)->count());
    }

    public function test_competing_capture_cannot_replace_existing_evidence(): void
    {
        $order = $this->order();
        $calls = 0;
        Http::fake(function () use ($order, &$calls) {
            $calls++;
            if ($calls === 1) {
                $this->assertTrue(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));

                return Http::response($this->reservation($order, $this->competingCanonical));
            }

            return Http::response($this->reservation($order));
        });
        $this->assertFalse(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));
        $this->assertSame(1, DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $order->id)->count());
        $this->assertDatabaseHas('legacy_reservation_order_evidence', ['direct_booking_order_id' => $order->id, 'canonical_id' => $this->canonical]);
    }

    public function test_mismatched_identity_and_existing_order_are_rejected(): void
    {
        $order = $this->order();
        Http::fake(fn () => Http::response([...$this->reservation($order), 'internalNote' => 'wrong']));
        $this->assertFalse(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));
        $order->update(['origin' => 'stays_existing']);
        $this->assertFalse(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));
        Http::assertSentCount(1);
        $this->assertSame(0, DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $order->id)->count());
    }

    public function test_guard_uses_evidence_only_when_enabled_and_revalidates_it(): void
    {
        $order = $this->order();
        Http::fake(fn () => Http::response($this->reservation($order)));
        $this->assertTrue(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));
        $guard = fn (string $id): bool => app(ExistingReservationPaymentLock::class)->synchronized($id,
            fn () => app(ReservationReleaseGuard::class)->hasAmbiguousOrder([$id, strtoupper($id), 'OTHER']));

        $this->assertTrue($guard($this->competingCanonical));
        config(['services.stays.experimental_legacy_order_evidence' => true]);
        $this->assertFalse($guard($this->competingCanonical));
        $this->assertTrue($guard($this->canonical));
        config(['services.stays.client_id' => 'different-account']);
        $this->assertTrue($guard($this->competingCanonical));
        config(['services.stays.client_id' => 'test-account']);
        $order->update(['stays_client_id' => 'changed']);
        $this->assertTrue($guard($this->competingCanonical));
        Http::assertSentCount(1);
    }

    public function test_guard_treats_missing_or_corrupt_evidence_as_ambiguous(): void
    {
        $order = $this->order();
        config(['services.stays.experimental_legacy_order_evidence' => true]);
        $guard = fn (): bool => app(ExistingReservationPaymentLock::class)->synchronized($this->competingCanonical,
            fn () => app(ReservationReleaseGuard::class)->hasAmbiguousOrder([$this->competingCanonical, 'OTHER']));
        $this->assertTrue($guard());
        Http::fake(fn () => Http::response($this->reservation($order)));
        $this->assertTrue(app(ExperimentalLegacyReservationEvidence::class)->capture($order->id));
        DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $order->id)->update(['reservation_reference' => 'WRONG']);
        $this->assertTrue($guard());
    }

    public function test_guard_skips_canonical_references_but_not_malformed_24_character_values(): void
    {
        $order = $this->order();
        config(['services.stays.experimental_legacy_order_evidence' => true]);
        $guard = fn (): bool => app(ExistingReservationPaymentLock::class)->synchronized($this->competingCanonical,
            fn () => app(ReservationReleaseGuard::class)->hasAmbiguousOrder([$this->competingCanonical, 'OTHER']));
        $order->update(['stays_reservation_id' => strtoupper($this->canonical)]);
        $this->assertFalse($guard());
        $target = 'a'.substr($this->competingCanonical, 1, 22).'b';
        $order->update(['stays_reservation_id' => 'A'.substr($target, 1)]);
        $this->assertTrue(app(ExistingReservationPaymentLock::class)->synchronized($target,
            fn () => app(ReservationReleaseGuard::class)->hasAmbiguousOrder([$target, strtoupper($target), 'OTHER'])));
        DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $target)->delete();
        $order->update(['stays_reservation_id' => str_repeat('g', 24)]);
        $this->assertTrue($guard());
        $order->update(['stays_reservation_id' => $this->canonical."\0suffix"]);
        $this->assertTrue($guard());
    }

    private function reservation(DirectBookingOrder $order, ?string $canonical = null): array
    {
        return ['_id' => $canonical ?? $this->canonical, 'id' => $this->reference, '_idlisting' => 'listing', '_idclient' => 'client',
            'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id];
    }

    private function order(): DirectBookingOrder
    {
        $order = new DirectBookingOrder([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'order-evidence-'.$this->orderId, 'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'stays_client_id' => 'client', 'stays_reservation_id' => $this->reference,
            'check_in' => '2026-11-13', 'check_out' => '2026-11-16', 'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0],
            'guest_name' => 'Teste', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00',
            'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website', 'operational_events' => [],
        ]);
        $order->id = $this->orderId;
        $order->save();

        return $order;
    }
}
