<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use App\Services\Payments\CieloEcommerceClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** End-to-end fakes exercise local integration only; they do not prove Stays writes. */
class ExperimentalExistingCheckoutBootstrapTest extends TestCase
{
    use RefreshDatabase;

    private bool $stripMarker = false;

    public function test_unrecorded_balance_bootstraps_verified_pending_before_exposing_checkout(): void
    {
        $this->configure();
        $this->fakeStays('success');
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.balanceStatus', 'unrecorded_candidate')
            ->assertJsonPath('reservation.candidateBalanceCents', 101600)->assertJsonPath('reservation.paymentMethods', ['pix']);
        $key = 'experimental-bootstrap-test-123';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertCreated()->assertJsonPath('success', true)->assertJsonStructure(['resume' => ['reference', 'token']]);
        $order = DirectBookingOrder::query()->sole();
        $snapshot = $order->quote_snapshot['existing_reservation'];
        $this->assertSame(str_repeat('a', 24), $snapshot['payment_id']);
        $this->assertSame(str_repeat('f', 24), $snapshot['pending_provider_id']);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertOk()->assertJsonPath('success', true);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'cielo') || in_array($r->method(), ['PATCH', 'DELETE'], true));
    }

    public function test_failed_write_never_exposes_token_and_never_repeats(): void
    {
        $this->configure();
        $this->fakeStays('failed');
        $key = 'experimental-bootstrap-test-123';
        foreach (range(1, 2) as $ignored) {
            $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
                ->assertStatus(503)->assertJsonPath('code', 'existing_receivable_unconfirmed')->assertJsonMissingPath('resume.token');
        }
        $this->assertNull(DirectBookingOrder::query()->sole()->quote_snapshot['existing_reservation']['payment_id']);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
    }

    #[DataProvider('bootstrapOriginScenarios')]
    public function test_existing_bootstrap_receivable_never_enters_regular_path(bool $removeMarker, bool $revokeApproval): void
    {
        $this->configure();
        $this->fakeStays('success');
        $this->withHeader('Idempotency-Key', 'bootstrap-original-key-123456')->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())->assertCreated();
        $this->stripMarker = $removeMarker;
        if ($revokeApproval) {
            config(['direct-booking.experimental_existing_approved_balances' => []]);
        }
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.balanceStatus', 'review_required')->assertJsonPath('reservation.paymentEnabled', false);
        $this->withHeader('Idempotency-Key', 'bootstrap-new-device-key-123')->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 1);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
    }

    public static function bootstrapOriginScenarios(): array
    {
        return ['marker and approval' => [false, false], 'approval revoked' => [false, true], 'marker removed and approval revoked' => [true, true]];
    }

    public function test_gateway_unavailable_never_creates_pending_receivable(): void
    {
        $this->configure(gatewayAvailable: false);
        $this->fakeStays('success');
        $this->withHeader('Idempotency-Key', 'experimental-bootstrap-test-123')->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertStatus(503)->assertJsonPath('code', 'existing_checkout_disabled');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $r) => $r->method() === 'POST');
    }

    public function test_stats_change_during_receivable_creation_never_exposes_a_payment_token(): void
    {
        $this->configure();
        $this->fakeStays('stats_changed');
        $this->withHeader('Idempotency-Key', 'experimental-bootstrap-test-123')->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertStatus(503)->assertJsonPath('code', 'existing_receivable_unconfirmed')->assertJsonMissingPath('resume.token');
        $this->assertNull(DirectBookingOrder::query()->sole()->quote_snapshot['existing_reservation']['payment_id']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'experimental_create_receivable', 'status' => 'attention_required']);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
    }

    public function test_pending_creation_inflating_reported_paid_stops_checkout_without_retry_or_charge(): void
    {
        $this->configure();
        $this->fakeStays('pending_inflates_paid');
        $key = 'experimental-bootstrap-stats-123';
        foreach (range(1, 2) as $ignored) {
            $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
                ->assertStatus(503)->assertJsonPath('code', 'existing_receivable_unconfirmed')->assertJsonMissingPath('resume.token');
        }
        $this->assertDatabaseHas('direct_booking_stays_actions', ['action_type' => 'experimental_create_receivable', 'status' => 'attention_required']);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'cielo') || in_array($r->method(), ['PATCH', 'DELETE'], true));
    }

    public function test_open_balance_does_not_require_manual_balance_approval(): void
    {
        $this->configure();
        config(['direct-booking.experimental_existing_approved_balances' => []]);
        $this->fakeStays('success');
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.balanceStatus', 'unrecorded_candidate')
            ->assertJsonPath('reservation.paymentEnabled', true);
        $this->withHeader('Idempotency-Key', 'experimental-bootstrap-test-123')->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertCreated()->assertJsonPath('success', true);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST'));
    }

    public function test_stays_open_balance_is_authoritative_over_stale_approval_metadata(): void
    {
        $this->configure();
        $approval = $this->approval();
        $approval['pending_amount_cents'] = 101500;
        config(['direct-booking.experimental_existing_approved_balances' => [str_repeat('c', 24) => $approval]]);
        $this->fakeStays('success');
        $this->withHeader('Idempotency-Key', 'experimental-bootstrap-test-123')->postJson('/api/existing-reservations/ZX91K/checkout', $this->payload())
            ->assertCreated()->assertJsonPath('success', true);
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    private function configure(bool $gatewayAvailable = true): void
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'direct-booking.enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true,
            'direct-booking.experimental_existing_receivable_creation_enabled' => true, 'direct-booking.experimental_existing_approved_balances' => [str_repeat('c', 24) => $this->approval()], 'direct-booking.payment_provider' => 'cielo',
            'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24)]);
        $this->mock(DirectCheckoutPaymentService::class, function ($mock) use ($gatewayAvailable): void {
            $mock->shouldReceive('availableMethods')->andReturn($gatewayAvailable ? ['pix'] : []);
            $mock->shouldReceive('publicKey')->andReturn(null);
            $mock->shouldReceive('provider')->andReturn('cielo');
        });
        $this->mock(CieloEcommerceClient::class)->shouldReceive('merchantId')->andReturn('test-merchant');
    }

    private function payload(): array
    {
        return ['expectedBalanceCents' => 101600, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
    }

    private function approval(): array
    {
        return ['version' => 'review-1', 'expires_at' => '2030-01-01T00:00:00+00:00', '_idclient' => str_repeat('d', 24), '_idlisting' => 'listing',
            'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22', 'guests' => 4, 'currency' => 'BRL', 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com', 'reservation_total_cents' => 101600, 'pending_amount_cents' => 101600];
    }

    private function fakeStays(string $mode): void
    {
        $reservationId = str_repeat('c', 24);
        $reservation = ['id' => 'ZX91K', '_id' => $reservationId, '_idclient' => str_repeat('d', 24), '_idlisting' => 'listing', 'type' => 'reserved', 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'partner' => ['name' => 'API booking.com'], 'stats' => ['_f_totalPaid' => 0]];
        if ($mode === 'pending_inflates_paid') {
            $reservation['stats'] = ['_f_totalPaid' => 0];
        }
        $commission = ['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com'];
        $created = false;
        $marker = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $r) use ($mode, &$reservation, $reservationId, $commission, &$created, &$marker) {
            if (str_contains($r->url(), '/finance/payment-providers/')) {
                return Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']);
            }
            if ($r->method() === 'POST') {
                $marker = $r['desc'];
                $created = in_array($mode, ['success', 'stats_changed', 'pending_inflates_paid'], true);
                if ($mode === 'stats_changed') {
                    $reservation['stats'] = ['_f_totalPaid' => 1];
                }
                if ($mode === 'pending_inflates_paid') {
                    $reservation['stats'] = ['_f_totalPaid' => 1016];
                }

                return Http::response([], $created ? 200 : 503);
            }
            if (str_contains($r->url(), '/finance/accounting-transactions/')) {
                return Http::response(['_id' => str_repeat('a', 24), 'reserveId' => $reservationId, 'type' => 'credit', 'paid' => false,
                    'bankAccountId' => str_repeat('f', 24), '_mcval' => ['BRL' => 1016]]);
            }
            if (str_ends_with($r->url(), '/payments')) {
                $new = ['_id' => str_repeat('a', 24), '_idpaymentProvider' => str_repeat('f', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 1016,
                    'expirationDate' => '2030-11-19', 'name' => 'Pagamento da reserva', 'desc' => $this->stripMarker ? null : $marker];

                return Http::response($created ? [$commission, $new] : [$commission]);
            }

            return Http::response($reservation);
        });
    }
}
