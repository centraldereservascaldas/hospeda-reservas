<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\ExperimentalExistingReceivableCreation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Fakes validate local safety logic; they do not establish the Stays contract. */
class ExperimentalExistingReceivableCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_missing_authoritative_paid_amount_never_creates_a_receivable(): void
    {
        [$order, $reservation, $commission] = $this->fixture('missing_stats');
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(str_ends_with($request->url(), '/payments') ? [$commission] : $reservation));
        $this->assertSame('experimental_receivable_source_changed', app(ExperimentalExistingReceivableCreation::class)->create($order, 'pix')['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() === 'POST');
    }

    public function test_simulated_write_reconciles_same_receivable_and_is_idempotent(): void
    {
        [$order, $reservation, $commission] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        $this->fakeStays($order, $reservation, $commission, 'success');
        $service = app(ExperimentalExistingReceivableCreation::class);
        $this->assertSame(['ready' => true, 'code' => 'experimental_receivable_verified', 'payment_id' => str_repeat('a', 24)], $service->create($order, 'pix'));
        $this->assertTrue($service->create($order, 'pix')['ready']);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
        Http::assertSent(fn (Request $r) => $r->method() === 'POST' && $r['_idpaymentProvider'] === str_repeat('f', 24)
            && $r['type'] === 'credit' && $r['status'] === 'pending' && $r['_f_val'] === 1016
            && $r['expirationDate'] === '2030-11-19' && $r['desc'] === 'CRCN_EXISTING_ORDER:'.$order->id.':PENDING');
        Http::assertNotSent(fn (Request $r) => in_array($r->method(), ['PATCH', 'DELETE'], true) || str_contains($r->url(), 'cielo'));
    }

    public function test_uncertain_write_without_visible_receivable_is_not_retried(): void
    {
        [$order, $reservation, $commission] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        $this->fakeStays($order, $reservation, $commission, 'failed');
        $service = app(ExperimentalExistingReceivableCreation::class);
        $this->assertSame('experimental_receivable_unconfirmed', $service->create($order, 'pix')['code']);
        $this->assertSame('experimental_receivable_already_started', $service->create($order, 'pix')['code']);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'experimental_create_receivable', 'status' => 'attention_required']);
    }

    public function test_failed_response_with_unique_exact_readback_is_reconciled(): void
    {
        [$order, $reservation, $commission] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        $this->fakeStays($order, $reservation, $commission, 'response_lost');
        $this->assertTrue(app(ExperimentalExistingReceivableCreation::class)->create($order, 'pix')['ready']);
    }

    public function test_existing_guest_credit_prevents_creation_of_a_second_receivable(): void
    {
        [$order, $reservation, $commission] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake(fn (Request $r) => str_ends_with($r->url(), '/payments')
            ? Http::response([$commission, ['_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 1016, 'name' => 'Pagamento da reserva']])
            : Http::response($reservation));
        $this->assertSame('experimental_receivable_source_changed', app(ExperimentalExistingReceivableCreation::class)->create($order, 'pix')['code']);
        Http::assertNotSent(fn (Request $r) => $r->method() !== 'GET');
    }

    public function test_order_snapshot_changed_after_source_read_prevents_post(): void
    {
        [$order, $reservation, $commission] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        $reads = 0;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($order, $reservation, $commission, &$reads) {
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            if (str_ends_with($request->url(), '/payments')) {
                if (++$reads === 2) {
                    $snapshot = $order->fresh()->quote_snapshot;
                    $snapshot['existing_reservation']['selected_payment_method'] = 'card';
                    $snapshot['existing_reservation']['selected_installments'] = 1;
                    $order->update(['quote_snapshot' => $snapshot]);
                }

                return Http::response([$commission]);
            }

            return Http::response($reservation);
        });
        $this->assertSame('experimental_receivable_source_changed', app(ExperimentalExistingReceivableCreation::class)->create($order, 'pix')['code']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'experimental_create_receivable', 'status' => 'attention_required']);
    }

    public function test_method_must_match_approved_order_snapshot_before_any_request(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake();
        $this->assertSame('experimental_receivable_order_invalid', app(ExperimentalExistingReceivableCreation::class)->create($order, 'card', 1)['code']);
        Http::assertNothingSent();
    }

    public function test_noncanonical_reservation_and_impossible_date_do_not_write(): void
    {
        [$order] = $this->fixture();
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake();
        $order->update(['stays_reservation_id' => 'ZX91K']);
        $this->assertSame('experimental_receivable_order_invalid', app(ExperimentalExistingReceivableCreation::class)->create($order, 'pix')['code']);
        $snapshot = $order->quote_snapshot;
        $snapshot['existing_reservation']['checkInDate'] = '2030-02-31';
        $order->update(['stays_reservation_id' => str_repeat('c', 24), 'quote_snapshot' => $snapshot]);
        $this->assertSame('experimental_receivable_order_invalid', app(ExperimentalExistingReceivableCreation::class)->create($order, 'pix')['code']);
        Http::assertNothingSent();
    }

    #[DataProvider('invalidReadbacks')]
    public function test_duplicate_or_cross_view_mismatch_is_not_accepted(string $mode): void
    {
        [$order, $reservation, $commission] = $this->fixture($mode);
        config(['direct-booking.experimental_existing_receivable_creation_enabled' => true]);
        $this->fakeStays($order, $reservation, $commission, $mode);
        $service = app(ExperimentalExistingReceivableCreation::class);
        $this->assertSame('experimental_receivable_unconfirmed', $service->create($order, 'pix')['code']);
        $this->assertSame('experimental_receivable_already_started', $service->create($order, 'pix')['code']);
    }

    public static function invalidReadbacks(): array
    {
        return ['duplicate' => ['duplicate'], 'wrong finance provider' => ['wrong_finance'], 'reported paid changed after pending creation' => ['stats_changed']];
    }

    private function fakeStays(DirectBookingOrder $order, array $reservation, array $commission, string $mode): void
    {
        $created = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $r) use ($order, $reservation, $commission, $mode, &$created) {
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            if ($r->method() === 'POST') {
                $created = $mode !== 'failed';

                return Http::response([], in_array($mode, ['failed', 'response_lost'], true) ? 503 : 200);
            }
            if (str_contains($r->url(), '/finance/accounting-transactions/')) {
                return Http::response(['_id' => str_repeat('a', 24), 'reserveId' => $reservation['_id'], 'type' => 'credit', 'paid' => false,
                    'bankAccountId' => str_repeat($mode === 'wrong_finance' ? 'b' : 'f', 24), '_mcval' => ['BRL' => 1016]]);
            }
            if (str_ends_with($r->url(), '/payments')) {
                $new = ['_id' => str_repeat('a', 24), '_idpaymentProvider' => str_repeat('f', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 1016,
                    'expirationDate' => '2030-11-19', 'name' => 'Pagamento da reserva', 'desc' => 'CRCN_EXISTING_ORDER:'.$order->id.':PENDING'];

                return Http::response($created ? ($mode === 'duplicate' ? [$commission, $new, $new] : [$commission, $new]) : [$commission]);
            }

            if ($mode === 'stats_changed' && $created) {
                $reservation['stats']['_f_totalPaid'] = 100;
            }

            return Http::response($reservation);
        });
    }

    private function fixture(string $suffix = 'default'): array
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.experimental_existing_approved_balances' => [str_repeat('c', 24) => ['version' => 'review-1', 'expires_at' => '2030-01-01T00:00:00+00:00', '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22', 'guests' => 4, 'currency' => 'BRL', 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com', 'reservation_total_cents' => 101600, 'pending_amount_cents' => 101600]]]);
        $this->mock(ExistingReservationPaymentChannels::class)->shouldReceive('verifiedProvider')->andReturn(str_repeat('f', 24));
        $reservation = ['_id' => 'reservation', '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22', 'guests' => 4, 'type' => 'reserved', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'stats' => ['_f_totalPaid' => 0]];
        $commission = ['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com'];
        $snapshot = ['_id' => 'reservation', '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22', 'guests' => 4, 'currency' => 'BRL', 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com', 'approval_version' => 'review-1', 'reservation_total_cents' => 101600, 'pending_amount_cents' => 101600, 'reported_paid_present' => true, 'reported_paid_cents' => 0, 'payment_id' => null, 'bootstrap_receivable' => true, 'channel_provider_ids' => ['pix' => str_repeat('f', 24)], 'selected_payment_method' => 'pix', 'selected_installments' => null];
        if ($suffix === 'stats_changed') {
            $reservation['stats'] = ['_f_totalPaid' => 0];
        }
        if ($suffix === 'missing_stats') {
            unset($reservation['stats']);
            $snapshot['reported_paid_present'] = false;
            $snapshot['reported_paid_cents'] = null;
        }
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'experimental-create-'.$suffix, 'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'stays_client_id' => 'client', 'stays_reservation_id' => str_repeat('c', 24), 'reservation_status' => 'reserved', 'check_in' => '2030-11-19', 'check_out' => '2030-11-22', 'guests' => ['adults' => 4, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Test', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '1016.00', 'currency' => 'BRL', 'quote_snapshot' => ['existing_reservation' => $snapshot], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => ['version' => 'test'], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'operational_events' => [], 'expires_at' => now()->addHour(),
        ]);
        // Use a unique order field while keeping each reservation identity internally consistent.
        $reservation['_id'] = str_repeat('c', 24);
        $snapshot['_id'] = $reservation['_id'];
        $order->update(['quote_snapshot' => ['existing_reservation' => $snapshot]]);

        return [$order, $reservation, $commission];
    }
}
