<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\Payments\CieloEcommerceClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ExistingReservationCheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-03 12:00:00'));
    }

    public function test_summary_is_not_accessible_or_looked_up_when_feature_is_disabled(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        Http::preventStrayRequests();
        Http::fake();

        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertNotFound()->assertJsonPath('success', false)
            ->assertHeader('Cache-Control', 'no-store, private')->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        Http::assertNothingSent();
    }

    public function test_booking_summary_shows_pending_candidate_without_exposing_guest_or_enabling_payment(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([
                ['type' => 'debit', 'status' => 'pending', '_f_val' => 59.25, 'name' => 'res. fee API booking.com'],
                ['_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'],
            ])
            : Http::response([
                'id' => 'ZY92K', '_id' => str_repeat('c', 24), 'type' => 'booked', '_idlisting' => 'unknown', '_idclient' => 'private-client',
                'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4,
                'guestsDetails' => ['adults' => 4, 'list' => [['name' => 'private-name', 'email' => 'private@example.test']]],
                'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com'],
            ]));

        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.candidateBalanceCents', 19750)
            ->assertJsonPath('reservation.paymentEnabled', false)
            ->assertJsonMissing(['name' => 'private-name', 'email' => 'private@example.test'])
            ->assertDontSee('private-client')->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_canceled_reservation_and_mismatched_code_are_not_returned(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['id' => 'OTHER', 'type' => 'canceled'])]);
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')->assertNotFound();
    }

    public function test_unavailable_payments_never_enable_a_charge(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([], 503)
            : Http::response(['id' => 'ZX91K', 'type' => 'reserved', 'price' => ['currency' => 'BRL', '_f_total' => 1016]]));
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.balanceStatus', 'review_required')
            ->assertJsonPath('reservation.paymentEnabled', false);
    }

    public function test_unrecorded_booking_balance_is_display_only_even_when_checkout_enabled(): void
    {
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret',
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.payment_provider' => 'cielo']);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com']])
            : Http::response(['id' => 'ZX91K', 'type' => 'reserved', 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'partner' => ['name' => 'API booking.com']]));
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.candidateBalanceCents', 101600)
            ->assertJsonPath('reservation.balanceStatus', 'unrecorded_candidate')
            ->assertJsonPath('reservation.paymentEnabled', false)->assertJsonPath('reservation.paymentMethods', []);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_property_missing_from_local_catalog_is_read_from_stays(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
        $listingId = str_repeat('f', 24);
        Http::fake(fn (Request $request) => match (true) {
            str_ends_with($request->url(), '/payments') => Http::response([]),
            str_contains($request->url(), '/content/listings/') => Http::response([
                '_id' => $listingId, '_mstitle' => ['pt_BR' => 'Apartamento Exemplo'],
                '_t_mainImageMeta' => ['url' => 'https://example.test/property.jpg'],
            ]),
            default => Http::response(['id' => 'ZX91K', 'type' => 'reserved', '_idlisting' => $listingId, 'price' => ['currency' => 'BRL', '_f_total' => 1016]]),
        });
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.property', 'Apartamento Exemplo')
            ->assertJsonPath('reservation.image', 'https://example.test/property.jpg')
            ->assertJsonPath('reservation.paymentEnabled', false);
    }

    public function test_booking_checkout_creates_one_local_order_without_creating_a_stays_reservation(): void
    {
        $this->configureCheckout();
        $key = 'existing-checkout-test-key-123';
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('success', true)->assertJsonPath('order.quoteTotal', '197.50')
            ->assertJsonPath('payment.enabled', true)->assertJsonStructure(['resume' => ['reference', 'token', 'path']]);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        $this->assertDatabaseHas('direct_booking_orders', ['origin' => 'stays_existing', 'stays_reservation_id' => str_repeat('c', 24), 'reservation_status' => 'booked']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_existing_checkout_cannot_start_while_reservation_release_is_claimed(): void
    {
        $this->configureCheckout();
        DB::table('existing_reservation_payment_locks')->insert(['stays_reservation_id' => str_repeat('c', 24), 'release_order_id' => fake()->uuid(), 'created_at' => now(), 'updated_at' => now()]);
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-release-guard-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_checkout_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_order_history_can_create_two_existing_orders_only_when_explicitly_enabled(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'history-order-key-first-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->withHeader('Idempotency-Key', 'history-order-key-second-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_checkout_already_started');
        config(['direct-booking.experimental_existing_order_history_enabled' => true]);
        $this->withHeader('Idempotency-Key', 'history-order-key-third-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->assertDatabaseCount('direct_booking_orders', 2);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_database_allows_existing_history_but_enforces_one_website_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'schema-order-key-first-0001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $first = DirectBookingOrder::query()->sole();
        $second = $first->replicate(['website_stays_reservation_id']);
        $second->forceFill(['idempotency_key' => 'schema-order-key-second-001', 'public_reference' => str_repeat('x', 40), 'resume_token' => str_repeat('y', 64)])->save();
        $website = $first->replicate(['website_stays_reservation_id']);
        $website->forceFill(['origin' => 'website', 'idempotency_key' => 'schema-order-key-website01', 'public_reference' => str_repeat('z', 40), 'resume_token' => str_repeat('w', 64)])->save();
        $this->assertDatabaseCount('direct_booking_orders', 3);

        $otherWebsite = $website->replicate(['website_stays_reservation_id']);
        $this->expectException(UniqueConstraintViolationException::class);
        $otherWebsite->forceFill(['idempotency_key' => 'schema-order-key-website02', 'public_reference' => str_repeat('k', 40), 'resume_token' => str_repeat('j', 64)])->save();
    }

    public function test_schema_rollback_refuses_to_discard_duplicate_reservation_history(): void
    {
        $this->configureCheckout();
        config(['direct-booking.experimental_existing_order_history_enabled' => true]);
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'rollback-order-key-first-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->withHeader('Idempotency-Key', 'rollback-order-key-second01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $migration = require database_path('migrations/2026_11_10_233000_allow_existing_reservation_order_history.php');
        try {
            $migration->down();
            $this->fail('Rollback must reject duplicate history.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('multiple orders', $e->getMessage());
        }
        $this->assertDatabaseCount('direct_booking_orders', 2);
    }

    public function test_schema_rollback_restores_original_unique_constraint_when_safe(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'rollback-safe-first-order-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $first = DirectBookingOrder::query()->sole();
        $copy = $first->replicate(['website_stays_reservation_id']);
        $migration = require database_path('migrations/2026_11_10_233000_allow_existing_reservation_order_history.php');
        DB::enableQueryLog();
        DB::flushQueryLog();
        $migration->down();
        $groupedQueries = array_values(array_filter(DB::getQueryLog(), fn (array $query): bool => str_contains(strtolower($query['query']), 'having count(*) > 1')));
        DB::disableQueryLog();
        $this->assertCount(1, $groupedQueries);
        $this->assertStringNotContainsString('select *', strtolower($groupedQueries[0]['query']));
        $this->assertFalse(Schema::hasColumn('direct_booking_orders', 'website_stays_reservation_id'));
        $this->expectException(UniqueConstraintViolationException::class);
        $copy->forceFill(['idempotency_key' => 'rollback-safe-second-order-1', 'public_reference' => str_repeat('k', 40), 'resume_token' => str_repeat('j', 64)])->save();
    }

    public function test_schema_migration_refuses_uninspected_partial_or_already_changed_state(): void
    {
        $migration = require database_path('migrations/2026_11_10_233000_allow_existing_reservation_order_history.php');
        try {
            $migration->up();
            $this->fail('Migration must not blindly retry an already changed schema.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('inspect it before retrying', $e->getMessage());
        }
        $this->assertTrue(Schema::hasColumn('direct_booking_orders', 'website_stays_reservation_id'));
        $this->assertTrue(Schema::hasIndex('direct_booking_orders', 'direct_orders_website_stays_unique'));
    }

    public function test_summary_only_offers_methods_compatible_with_the_receivable(): void
    {
        $this->configureCheckout();
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.paymentEnabled', true)
            ->assertJsonPath('reservation.paymentMethods', ['pix'])
            ->assertJsonPath('reservation.cardInstallments', []);
    }

    public function test_incomplete_reservation_details_hide_payment_and_cannot_create_order(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->configureCheckout(withFake: false);
        $reservation = ['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']];
        Http::fake(function (Request $request) use (&$reservation) {
            if (str_contains($request->url(), '/finance/payment-providers/')) {
                return Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Pix API Cielo']);
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]);
            }

            return Http::response($reservation);
        });
        $complete = $reservation;
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        foreach (['missing_child_count', 'string_count', 'mismatched_total', 'missing_date'] as $variant) {
            $reservation = $complete;
            match ($variant) {
                'missing_child_count' => $reservation['guestsDetails'] = ['adults' => 4, 'infants' => 0],
                'string_count' => $reservation['guestsDetails']['adults'] = '4',
                'mismatched_total' => $reservation['guests'] = 5,
                'missing_date' => $reservation['checkInDate'] = null,
            };
            $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
                ->assertOk()->assertJsonPath('reservation.paymentEnabled', false)->assertJsonPath('reservation.paymentMethods', []);
            $this->withHeader('Idempotency-Key', 'incomplete-reservation-test-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertStatus(409);
        }
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_missing_or_changed_balance_never_creates_an_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 10000, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_optional_ledger_gate_hides_inconsistent_balance_and_blocks_checkout(): void
    {
        $this->configureCheckout();
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class, function ($mock): void {
            $mock->shouldReceive('confirmsSnapshot')->twice()->andReturnFalse();
        });
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.balanceStatus', 'review_required')->assertJsonPath('reservation.paymentEnabled', false);
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-ledger-gate-test-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_successful_ledger_gate_does_not_override_provider_guard(): void
    {
        $this->configureCheckout(pendingProvider: str_repeat('b', 24));
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldNotReceive('confirmsSnapshot');
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-ledger-gate-test-456')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(503)->assertJsonPath('code', 'existing_payment_channel_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_successful_optional_ledger_gate_preserves_existing_checkout_flow(): void
    {
        $this->configureCheckout();
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->once()->andReturnTrue();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-ledger-gate-test-789')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('success', true);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_existing_card_is_not_advertised_or_created_before_fee_accounting_is_verified(): void
    {
        $this->configureCheckout(pendingProvider: str_repeat('3', 24));
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')->assertOk()
            ->assertJsonPath('reservation.paymentEnabled', false)->assertJsonPath('reservation.paymentMethods', [])
            ->assertJsonPath('reservation.cardInstallments', []);
        $this->withHeader('Idempotency-Key', 'existing-card-blocked-123456')->postJson('/api/existing-reservations/ZY92K/checkout', [
            'expectedBalanceCents' => 19750, 'paymentMethod' => 'card', 'installments' => 3,
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true,
        ])->assertStatus(503)->assertJsonPath('code', 'existing_card_fee_accounting_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_cycle_without_ledger_is_not_offered_and_does_not_create_order(): void
    {
        $this->configureCheckout();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => false]);
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')->assertOk()
            ->assertJsonPath('reservation.paymentEnabled', false)->assertJsonPath('reservation.paymentMethods', []);
        $this->withHeader('Idempotency-Key', 'existing-cycle-no-ledger-123456')->postJson('/api/existing-reservations/ZY92K/checkout', [
            'expectedBalanceCents' => 19750, 'paymentMethod' => 'pix',
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true,
        ])->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_reusing_submission_key_for_a_different_payment_method_is_rejected(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $key = 'existing-checkout-method-key-123';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $payload['paymentMethod'] = 'card';
        $payload['installments'] = 3;
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(503)->assertJsonPath('code', 'existing_card_fee_accounting_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_second_submission_with_a_new_key_does_not_create_a_second_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-111')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-222')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertStatus(409)->assertJsonPath('code', 'existing_checkout_already_started');
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_reservation_with_no_guest_receivable_never_assumes_the_total_is_unpaid(): void
    {
        $this->configureCheckout(false);
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com']])
            : Http::response(['id' => 'ZX91K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'reserved', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'partner' => ['name' => 'API booking.com']]));
        $payload = ['expectedBalanceCents' => 101600, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-123')->postJson('/api/existing-reservations/ZX91K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_existing_receivable_with_other_provider_does_not_create_checkout(): void
    {
        $this->configureCheckout(pendingProvider: str_repeat('b', 24));
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'existing-checkout-channel-test-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(503)->assertJsonPath('code', 'existing_payment_channel_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    private function configureCheckout(bool $withFake = true, ?string $pendingProvider = null): void
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.payment_provider' => 'cielo', 'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24), 'direct-booking.stays_cielo_card_provider_ids' => array_combine(range(1, 6), array_map(fn ($n) => str_repeat((string) $n, 24), range(1, 6)))]);
        $this->mock(DirectCheckoutPaymentService::class, function ($mock): void {
            $mock->shouldReceive('availableMethods')->andReturn(['pix', 'card']);
            $mock->shouldReceive('publicKey')->andReturn(null);
            $mock->shouldReceive('provider')->andReturn('cielo');
        });
        $this->mock(CieloEcommerceClient::class)->shouldReceive('merchantId')->andReturn('test-merchant');
        Http::preventStrayRequests();
        if (! $withFake) {
            return;
        }
        $pendingProvider ??= str_repeat('f', 24);
        Http::fake(fn (Request $request) => match (true) {
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Pix API Cielo']),
            str_ends_with($request->url(), '/payments') => Http::response([['_idpaymentProvider' => $pendingProvider, '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']]),
        });
    }
}
