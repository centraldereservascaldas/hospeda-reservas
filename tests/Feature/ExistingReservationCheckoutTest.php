<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentCycleRegistry;
use App\Services\ExistingReservationPaymentPlanPolicy;
use App\Services\LegalPageRegistry;
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
use Illuminate\Support\Str;
use Tests\TestCase;

class ExistingReservationCheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-03 12:00:00'));
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => '575c8054-6646-443c-bf62-07945019a32f',
            'email' => 'guest@example.test',
            'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Guest Example'],
        ], 200)]);
        $this->withToken('valid-access-token');
        $this->useLegacyExistingReservationFixtures();
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
                'id' => 'ZY92K', '_id' => str_repeat('c', 24), 'type' => 'reserved', '_idlisting' => 'unknown', '_idclient' => 'private-client',
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

    public function test_fully_paid_booked_reservation_returns_only_minimal_completion_state(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            $this->assertSame('GET', $request->method());
            $this->assertStringNotContainsString('/payments', $request->url());

            return Http::response([
                'id' => 'ZY92K', '_id' => str_repeat('c', 24), 'type' => 'booked',
                '_idlisting' => 'private-listing', 'checkInDate' => '2026-12-01', 'checkOutDate' => '2026-12-05',
                'guests' => 4, 'price' => ['currency' => 'BRL', '_f_total' => 395],
                'stats' => ['_f_totalPaid' => 400], 'partner' => ['name' => 'API booking.com'],
            ]);
        });

        $response = $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertOk()
            ->assertExactJson(['success' => true, 'reservation' => ['code' => 'ZY92K', 'state' => 'completed']])
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $response->assertDontSee('private-listing')->assertDontSee('2026-12-01')->assertDontSee('400');
        Http::assertSentCount(1);
    }

    public function test_paid_reservation_that_is_still_reserved_fails_closed_without_details(): void
    {
        config(['direct-booking.existing_reservation_checkout_enabled' => true]);
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret']);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response([
            'id' => 'ZY92K', 'type' => 'reserved', '_idlisting' => 'private-listing',
            'price' => ['currency' => 'BRL', '_f_total' => 395],
            'stats' => ['_f_totalPaid' => 395],
        ])]);

        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertStatus(503)
            ->assertExactJson(['success' => false, 'message' => 'Não foi possível consultar esta reserva agora.'])
            ->assertDontSee('private-listing')
            ->assertHeader('Cache-Control', 'no-store, private');
        Http::assertSentCount(1);
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

    public function test_unrecorded_booking_balance_without_reported_paid_amount_requires_review(): void
    {
        config(['services.stays.client_id' => 'test-client', 'services.stays.client_secret' => 'test-secret',
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.payment_provider' => 'cielo']);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com']])
            : Http::response(['id' => 'ZX91K', 'type' => 'reserved', 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'partner' => ['name' => 'API booking.com']]));
        $this->getJson('/api/existing-reservations/ZX91K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.candidateBalanceCents', null)
            ->assertJsonPath('reservation.balanceStatus', 'review_required')
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

    public function test_existing_checkout_validates_and_encrypts_the_reservation_holder_cpf(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-holder-cpf-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertDontSee('52998224725');
        $order = DirectBookingOrder::query()->sole();
        $this->assertSame('52998224725', $order->guest_cpf);
        $this->assertNotSame('52998224725', DB::table('direct_booking_orders')->where('id', $order->id)->value('guest_cpf'));
        $this->withHeader('Idempotency-Key', 'existing-holder-cpf-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $payload['guest']['cpf'] = '11111111111';
        $this->withHeader('Idempotency-Key', 'existing-holder-invalid-cpf-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('guest.cpf');
        $payload['guest']['cpf'] = '52998224724';
        $this->withHeader('Idempotency-Key', 'existing-holder-invalid-digit-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('guest.cpf');
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_new_order_requires_cpf_and_valid_brazilian_phone_before_contacting_stays(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '11912345678',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'missing-holder-cpf-phone-key')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors(['guest.cpf', 'guest.phone']);
        $this->assertDatabaseCount('direct_booking_orders', 0);

        $payload['guest']['cpf'] = '52998224725';
        $payload['guest']['phone'] = '+55 (64) 99999-9999';
        $this->withHeader('Idempotency-Key', 'valid-holder-cpf-phone-key')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated();
        $this->assertSame('64999999999', DirectBookingOrder::query()->sole()->guest_phone);
        $this->withHeader('Idempotency-Key', 'valid-holder-cpf-phone-key')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertOk();
    }

    public function test_new_order_rejects_phone_with_letters_even_when_digits_are_valid(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => 'abc64999999999xyz', 'cpf' => '52998224725',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'invalid-phone-letters-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('guest.phone');
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_legacy_replay_preserves_order_with_no_cpf_and_old_phone(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $key = 'legacy-holder-validation-key';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();

        unset($payload['guest']['cpf']);
        $payload['guest']['phone'] = '123';
        $fingerprintData = ['ZY92K', 19750, $payload['guest'], 'pix', null, true, $payload['acceptedContract']];
        $fingerprint = hash_hmac('sha256', json_encode($fingerprintData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
        DirectBookingOrder::query()->sole()->forceFill(['guest_cpf' => null, 'guest_phone' => '123', 'request_fingerprint' => $fingerprint])->save();

        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_historical_replay_without_holder_cpf_or_contract_returns_token_without_enabling_payment(): void
    {
        $this->configureCheckout();
        $key = 'historical-holder-contract-replay-key';
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $created = $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();

        unset($payload['guest']['cpf'], $payload['acceptedContract']);
        $payload['guest']['phone'] = '123';
        $fingerprintData = ['ZY92K', 19750, $payload['guest'], 'pix', null, true];
        $fingerprint = hash_hmac('sha256', json_encode($fingerprintData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
        $order->forceFill([
            'guest_cpf' => null,
            'guest_phone' => '123',
            'request_fingerprint' => $fingerprint,
            'accepted_terms_snapshot' => ['version' => 'existing-booking-payment-v1'],
        ])->save();

        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertOk()
            ->assertJsonPath('code', 'existing_checkout_replay_only')
            ->assertJsonPath('resume.reference', $created->json('resume.reference'))
            ->assertJsonPath('resume.token', $created->json('resume.token'))
            ->assertJsonPath('payment.enabled', false);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
        Http::assertNotSent(fn (Request $request): bool => $request->method() !== 'GET');
    }

    public function test_reused_order_cannot_change_holder_cpf_and_original_request_remains_replayable(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'holder-cpf-original-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $changed = $payload;
        $changed['guest']['cpf'] = '11144477735';
        $this->withHeader('Idempotency-Key', 'holder-cpf-different-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)
            ->assertConflict()->assertJsonPath('code', 'existing_checkout_already_started');
        $this->assertSame('52998224725', DirectBookingOrder::query()->sole()->guest_cpf);
        $this->withHeader('Idempotency-Key', 'holder-cpf-original-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_reused_legacy_order_cannot_add_holder_cpf_without_changing_original_request(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => [
            'fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725',
        ], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'holder-cpf-legacy-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        unset($payload['guest']['cpf']);
        $fingerprintData = ['ZY92K', 19750, $payload['guest'], 'pix', null, true, $payload['acceptedContract']];
        $fingerprint = hash_hmac('sha256', json_encode($fingerprintData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
        DirectBookingOrder::query()->sole()->forceFill(['guest_cpf' => null, 'request_fingerprint' => $fingerprint])->save();
        $changed = $payload;
        $changed['guest']['cpf'] = '52998224725';
        $this->withHeader('Idempotency-Key', 'holder-cpf-additional-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)
            ->assertConflict()->assertJsonPath('code', 'existing_checkout_already_started');
        $this->assertNull(DirectBookingOrder::query()->sole()->guest_cpf);
        $this->withHeader('Idempotency-Key', 'holder-cpf-legacy-key-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
    }

    public function test_booking_checkout_creates_one_local_order_without_creating_a_stays_reservation(): void
    {
        $this->configureCheckout();
        $key = 'existing-checkout-test-key-123';
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('success', true)->assertJsonPath('order.quoteTotal', '197.50')
            ->assertJsonPath('payment.enabled', true)->assertJsonStructure(['resume' => ['reference', 'token', 'path']]);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        $this->assertDatabaseHas('direct_booking_orders', ['origin' => 'stays_existing', 'stays_reservation_id' => str_repeat('c', 24), 'reservation_status' => 'reserved']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_existing_checkout_cannot_start_while_reservation_release_is_claimed(): void
    {
        $this->configureCheckout();
        DB::table('existing_reservation_payment_locks')->insert(['stays_reservation_id' => str_repeat('c', 24), 'release_order_id' => fake()->uuid(), 'created_at' => now(), 'updated_at' => now()]);
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-release-guard-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_checkout_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_unverified_decline_does_not_allow_a_new_submission_key(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'history-order-key-first-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $order->forceFill(['status' => DirectBookingOrderStatus::PagamentoRecusado, 'payment_status' => 'rejected'])->save();
        $order->paymentAttempts()->create([
            'idempotency_key' => 'history-rejected-attempt-01', 'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant',
            'payment_method' => 'card', 'payment_method_id' => 'cielo_credit_card', 'status' => 'rejected',
            'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL',
        ]);
        $this->withHeader('Idempotency-Key', 'history-order-key-second-01')
            ->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertConflict();
        $this->withHeader('Idempotency-Key', 'history-order-key-first-001')
            ->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertDatabaseCount('direct_booking_orders', 1);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_changed_holder_requires_a_verified_terminal_cycle_and_preserves_original_replay(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'retry-contact-first-order-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $changed = $payload;
        unset($changed['guest']['cpf']);
        $changed['guest']['fullName'] = 'Novo Responsável';
        $this->withHeader('Idempotency-Key', 'retry-contact-second-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertUnprocessable()->assertJsonValidationErrors('guest.cpf');
        $changed['guest']['cpf'] = '11144477735';
        $this->withHeader('Idempotency-Key', 'retry-contact-second-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertConflict();
        $this->withHeader('Idempotency-Key', 'retry-contact-first-order-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertSame('Hóspede Teste', $order->fresh()->guest_name);
        $this->assertSame('52998224725', $order->fresh()->guest_cpf);
    }

    public function test_reused_order_cannot_change_payment_method_or_installments_before_a_terminal_cycle(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'card', 'installments' => 3,
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'card-original-request-1234')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $changed = $payload;
        $changed['installments'] = 2;
        $this->withHeader('Idempotency-Key', 'card-changed-request-12345')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertConflict();
        $changed = $payload;
        $changed['paymentMethod'] = 'pix';
        unset($changed['installments']);
        $this->withHeader('Idempotency-Key', 'pix-changed-request-123456')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertConflict();
        $this->withHeader('Idempotency-Key', 'card-original-request-1234')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertSame(3, DirectBookingOrder::query()->sole()->quote_snapshot['existing_reservation']['selected_installments']);
    }

    public function test_changed_holder_after_verified_decline_creates_a_new_immutable_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'retry-contact-first-order-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $order->forceFill(['status' => DirectBookingOrderStatus::PagamentoRecusado, 'payment_status' => 'rejected'])->save();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'retry-contact-rejected-01', 'request_fingerprint' => str_repeat('d', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant', 'gateway_payment_id' => 'verified-decline',
            'gateway_status' => 'rejected', 'payment_method' => 'card', 'payment_method_id' => 'cielo_credit_card', 'status' => 'rejected',
            'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL',
        ]);
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => (string) Str::uuid(), 'stays_reservation_id' => str_repeat('c', 24),
            'active_reservation_id' => null, 'direct_booking_order_id' => $order->id,
            'direct_booking_payment_attempt_id' => $attempt->id, 'idempotency_key' => 'declined-cycle-key-123456',
            'state' => 'declined', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $changed = $payload;
        $changed['guest'] = ['fullName' => 'Novo Responsável', 'email' => 'novo@example.test', 'phone' => '64988887777', 'cpf' => '11144477735'];
        $response = $this->withHeader('Idempotency-Key', 'retry-contact-second-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertCreated();
        $this->assertNotSame($order->public_reference, $response->json('order.publicReference'));
        $this->withHeader('Idempotency-Key', 'retry-contact-second-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertOk();
        $changed['guest']['fullName'] = 'Outro Nome';
        $this->withHeader('Idempotency-Key', 'retry-contact-second-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertConflict();
        $this->assertSame('Hóspede Teste', $order->fresh()->guest_name);
        $this->withHeader('Idempotency-Key', 'retry-contact-first-order-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertDatabaseCount('direct_booking_orders', 2);
    }

    public function test_new_key_cannot_be_acknowledged_and_reused_after_a_later_decline(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'binding-order-original-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->withHeader('Idempotency-Key', 'binding-order-another-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertConflict();
        $order = DirectBookingOrder::query()->sole();
        $order->forceFill(['status' => DirectBookingOrderStatus::PagamentoRecusado, 'payment_status' => 'rejected'])->save();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'binding-attempt-rejected-123', 'request_fingerprint' => str_repeat('d', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant', 'gateway_payment_id' => 'verified-decline',
            'gateway_status' => 'rejected', 'payment_method' => 'pix', 'payment_method_id' => 'cielo_pix', 'status' => 'rejected',
            'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL',
        ]);
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => (string) Str::uuid(), 'stays_reservation_id' => str_repeat('c', 24), 'active_reservation_id' => null,
            'direct_booking_order_id' => $order->id, 'direct_booking_payment_attempt_id' => $attempt->id,
            'idempotency_key' => 'binding-cycle-declined-123', 'state' => 'declined', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $payload['guest']['fullName'] = 'Outro Responsável';
        $created = $this->withHeader('Idempotency-Key', 'binding-order-another-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->assertNotSame($order->public_reference, $created->json('order.publicReference'));
        $payload['guest']['fullName'] = 'Terceiro Responsável';
        $this->withHeader('Idempotency-Key', 'binding-order-another-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertConflict();
        $this->assertDatabaseCount('direct_booking_orders', 2);
    }

    public function test_expired_terminal_order_can_be_replaced_when_current_balance_differs(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'expired-balance-first-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $oldOrder = DirectBookingOrder::query()->sole();
        $oldOrder->forceFill(['status' => DirectBookingOrderStatus::Expirado, 'payment_status' => 'expired', 'quote_total' => '200.00', 'expires_at' => now()->subMinute()])->save();

        $response = $this->withHeader('Idempotency-Key', 'expired-balance-renew-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('success', true)->assertJsonPath('order.quoteTotal', '197.50');

        $this->assertNotSame($oldOrder->public_reference, $response->json('order.publicReference'));
        $this->assertDatabaseCount('direct_booking_orders', 2);
    }

    public function test_disagreeing_settlement_audits_keep_approved_payment_blocked(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'audit-disagreement-order-first')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $snapshot = $order->quote_snapshot;
        $snapshot['existing_reservation']['reported_paid_cents'] = 0;
        $snapshot['existing_reservation']['pending_amount_cents'] = 19750;
        $snapshot['existing_reservation']['payment_id'] = str_repeat('b', 24);
        $order->forceFill([
            'status' => DirectBookingOrderStatus::AtencaoOperacional,
            'payment_status' => 'approved',
            'quote_snapshot' => $snapshot,
        ])->save();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'audit-disagreement-payment-01', 'request_fingerprint' => str_repeat('e', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant',
            'payment_method' => 'pix', 'payment_method_id' => 'cielo_pix', 'status' => 'approved',
            'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL',
        ]);
        $this->mock(ExistingReservationPaymentCycleRegistry::class)
            ->shouldReceive('prepare')->once()->with(str_repeat('c', 24))->andReturn([
                'verified' => [$attempt->id => str_repeat('a', 64)],
                'verifiedCycles' => [],
                'currentAudit' => [
                    'status' => 'consistent_candidate', 'balance_cents' => 19750, 'pending_cents' => 19750,
                    'pending_payment_id' => str_repeat('a', 24), 'pending_provider_id' => str_repeat('f', 24), 'paid_cents' => 19750,
                ],
                'auditsDisagree' => true,
                'reservationId' => str_repeat('c', 24),
            ]);

        $this->withHeader('Idempotency-Key', 'audit-disagreement-order-second')
            ->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_checkout_already_started');

        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_existing_order_with_pending_attempt_cannot_be_reused_for_another_charge(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'active-order-key-first-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $order->paymentAttempts()->create([
            'idempotency_key' => 'active-order-attempt-01', 'request_fingerprint' => str_repeat('c', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant',
            'payment_method' => 'pix', 'payment_method_id' => 'cielo_pix', 'status' => 'pending',
            'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL',
        ]);
        $payload['guest'] = ['fullName' => 'Novo Responsável', 'email' => 'novo@example.test', 'phone' => '64988887777', 'cpf' => '11144477735'];
        $this->withHeader('Idempotency-Key', 'active-order-key-second01')
            ->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertConflict()->assertJsonPath('code', 'existing_checkout_already_started');
        $this->assertSame('Hóspede Teste', $order->fresh()->guest_name);
        $this->assertSame('guest@example.test', $order->fresh()->guest_email);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_expired_terminal_attempt_requires_verified_closed_cycle_before_replacement(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'expired-cycle-first-order-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $order->forceFill(['status' => DirectBookingOrderStatus::Expirado, 'payment_status' => 'expired', 'expires_at' => now()->subMinute()])->save();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'expired-cycle-attempt-123', 'request_fingerprint' => str_repeat('d', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant', 'gateway_payment_id' => 'verified-expiry',
            'gateway_status' => 'expired', 'payment_method' => 'pix', 'payment_method_id' => 'cielo_pix', 'status' => 'expired',
            'amount' => '197.50', 'base_amount' => '197.50', 'currency' => 'BRL',
        ]);
        $cycleId = (string) Str::uuid();
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => $cycleId, 'stays_reservation_id' => str_repeat('c', 24), 'active_reservation_id' => str_repeat('c', 24),
            'direct_booking_order_id' => $order->id, 'direct_booking_payment_attempt_id' => $attempt->id,
            'idempotency_key' => 'expired-cycle-open-12345', 'state' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->withHeader('Idempotency-Key', 'expired-cycle-next-order-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertConflict()->assertJsonPath('code', 'existing_checkout_already_started');
        $this->assertDatabaseCount('direct_booking_orders', 1);
        DB::table('existing_reservation_payment_cycles')->where('id', $cycleId)->update(['state' => 'declined', 'active_reservation_id' => null]);
        $this->withHeader('Idempotency-Key', 'expired-cycle-next-order-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $this->assertDatabaseCount('direct_booking_orders', 2);
    }

    public function test_expired_order_without_attempt_cannot_replace_an_open_cycle(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'expired-empty-first-order-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $order->forceFill(['status' => DirectBookingOrderStatus::Expirado, 'payment_status' => 'expired', 'expires_at' => now()->subMinute()])->save();
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => (string) Str::uuid(), 'stays_reservation_id' => str_repeat('c', 24), 'active_reservation_id' => str_repeat('c', 24),
            'direct_booking_order_id' => $order->id, 'idempotency_key' => 'expired-empty-cycle-open-123', 'state' => 'open',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->withHeader('Idempotency-Key', 'expired-empty-next-order-001')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertConflict()->assertJsonPath('code', 'existing_checkout_already_started');
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_expired_order_can_be_replaced_after_reservation_is_revalidated(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'expired-order-key-first-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $oldOrder = DirectBookingOrder::query()->sole();
        $oldOrder->forceFill(['status' => DirectBookingOrderStatus::Expirado, 'payment_status' => 'expired', 'expires_at' => now()->subMinute()])->save();

        $response = $this->withHeader('Idempotency-Key', 'expired-order-key-second01')
            ->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('success', true);

        $this->assertNotSame($oldOrder->public_reference, $response->json('order.publicReference'));
        $this->assertDatabaseCount('direct_booking_orders', 2);
    }

    public function test_database_allows_existing_history_but_enforces_one_website_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
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
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'rollback-order-key-first-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $first = DirectBookingOrder::query()->sole();
        $duplicate = $first->replicate(['website_stays_reservation_id']);
        $duplicate->forceFill([
            'idempotency_key' => 'rollback-order-key-second01',
            'public_reference' => str_repeat('x', 40),
            'resume_token' => str_repeat('y', 64),
        ])->save();
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
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
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
            ->assertJsonPath('reservation.paymentMethods', ['pix', 'card'])
            ->assertJsonPath('reservation.cardInstallments', range(1, 6));
    }

    public function test_incomplete_reservation_details_hide_payment_and_cannot_create_order(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->configureCheckout(withFake: false);
        $reservation = ['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'reserved', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']];
        Http::fake(function (Request $request) use (&$reservation) {
            if (str_contains($request->url(), '/finance/payment-providers/')) {
                return Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']);
            }
            if (str_ends_with($request->url(), '/payments')) {
                return Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]);
            }

            return Http::response($reservation);
        });
        $complete = $reservation;
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
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
        $payload = ['expectedBalanceCents' => 10000, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
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
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
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
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-ledger-gate-test-456')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(503)->assertJsonPath('code', 'existing_payment_channel_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_successful_optional_ledger_gate_preserves_existing_checkout_flow(): void
    {
        $this->configureCheckout();
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->once()->andReturnTrue();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-ledger-gate-test-789')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('success', true);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_existing_card_checkout_requires_the_external_site_channel_and_does_not_write_to_stays(): void
    {
        $this->configureCheckout(pendingProvider: str_repeat('f', 24));
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')->assertOk()
            ->assertJsonPath('reservation.paymentEnabled', true)->assertJsonPath('reservation.paymentMethods', ['pix', 'card'])
            ->assertJsonPath('reservation.cardInstallments', range(1, 6));
        $this->withHeader('Idempotency-Key', 'existing-card-blocked-123456')->postJson('/api/existing-reservations/ZY92K/checkout', [
            'expectedBalanceCents' => 19750, 'paymentMethod' => 'card', 'installments' => 3,
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance(),
        ])->assertCreated()->assertJsonPath('payment.enabled', true)->assertJsonPath('payment.methods', ['card']);
        $this->assertDatabaseCount('direct_booking_orders', 1);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_unrecorded_balance_creates_checkout_without_creating_receivable_before_capture(): void
    {
        $this->configureCheckout(withFake: false);
        Http::fake(fn (Request $request) => match (true) {
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']),
            str_ends_with($request->url(), '/payments') => Http::response([]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24),
                'type' => 'reserved', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4,
                'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395],
                'stats' => ['_f_totalPaid' => 197.50], 'partner' => ['name' => 'API booking.com']]),
        });
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'card', 'installments' => 3,
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'unrecorded-balance-checkout-01')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('payment.enabled', true);
        $snapshot = DirectBookingOrder::query()->sole()->quote_snapshot['existing_reservation'];
        $this->assertTrue($snapshot['bootstrap_receivable']);
        $this->assertSame('after_capture', $snapshot['receivable_creation_timing']);
        $this->assertNull($snapshot['payment_id']);
        $this->assertSame(str_repeat('f', 24), $snapshot['pending_provider_id']);
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
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance(),
        ])->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_reusing_submission_key_for_a_different_payment_method_is_rejected(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $key = 'existing-checkout-method-key-123';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $payload['paymentMethod'] = 'card';
        $payload['installments'] = 3;
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_checkout_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_second_submission_with_a_new_key_does_not_create_a_second_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-111')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $first = DirectBookingOrder::query()->sole();
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-222')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertConflict();
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-111')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_reservation_with_no_guest_receivable_never_assumes_the_total_is_unpaid(): void
    {
        $this->configureCheckout(false);
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com']])
            : Http::response(['id' => 'ZX91K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'reserved', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'partner' => ['name' => 'API booking.com']]));
        $payload = ['expectedBalanceCents' => 101600, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-checkout-test-key-123')->postJson('/api/existing-reservations/ZX91K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_existing_receivable_with_other_provider_does_not_create_checkout(): void
    {
        $this->configureCheckout(pendingProvider: str_repeat('b', 24));
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'existing-checkout-channel-test-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(503)->assertJsonPath('code', 'existing_payment_channel_unavailable');
        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_deposit_plan_requires_enabled_flag_and_a_matching_unpaid_pix_receivable(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->configureCheckout(false);
        $this->mock(ExistingReservationLedgerAudit::class, function ($mock): void {
            $mock->shouldReceive('confirmsSnapshot')->andReturnTrue();
        });
        Http::fake(fn (Request $request) => match (true) {
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']),
            str_ends_with($request->url(), '/payments') => Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 395, 'name' => 'Pagamento da reserva']]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'reserved', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 0], 'partner' => ['name' => 'API booking.com']]),
        });
        $payload = ['expectedBalanceCents' => 39500, 'paymentMethod' => 'pix', 'paymentPlan' => 'deposit', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'deposit-plan-disabled-1234')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertStatus(409)->assertJsonPath('code', 'existing_deposit_unavailable');
        $cardPayload = array_replace($payload, ['paymentMethod' => 'card', 'installments' => 1]);
        $this->withHeader('Idempotency-Key', 'deposit-plan-card-1234567')->postJson('/api/existing-reservations/ZY92K/checkout', $cardPayload)->assertStatus(409)->assertJsonPath('code', 'existing_deposit_unavailable');
        $flags = [
            'experimental_existing_deposit_enabled',
            'experimental_existing_cycle_settlement_enabled',
            'experimental_existing_ledger_audit_enabled',
        ];
        for ($combination = 0; $combination < 7; $combination++) {
            $flagConfig = [];
            foreach ($flags as $index => $flag) {
                $flagConfig['direct-booking.'.$flag] = ($combination & (1 << $index)) !== 0;
            }
            config($flagConfig);
            $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')->assertOk()
                ->assertJsonPath('reservation.paymentPlans.deposit.methods', [])
                ->assertJsonPath('reservation.paymentPlans.deposit.amountCents', null);
            $this->withHeader('Idempotency-Key', 'deposit-plan-partial-flags-'.$combination.'-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
                ->assertStatus(409);
            $this->assertDatabaseCount('direct_booking_orders', 0);
        }
        config([
            'direct-booking.experimental_existing_deposit_enabled' => true,
            'direct-booking.experimental_existing_ledger_audit_enabled' => true,
            'direct-booking.experimental_existing_cycle_settlement_enabled' => true,
        ]);
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.paymentEnabled', true)
            ->assertJsonPath('reservation.outstandingBalanceCents', 39500)
            ->assertJsonPath('reservation.paymentPlans.full.methods', ['pix', 'card'])
            ->assertJsonPath('reservation.paymentPlans.full.amountCents', 39500)
            ->assertJsonPath('reservation.paymentPlans.deposit.methods', ['pix'])
            ->assertJsonPath('reservation.paymentPlans.deposit.amountCents', 19750);
        $created = $this->withHeader('Idempotency-Key', 'deposit-plan-enabled-12345')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated()->assertJsonPath('order.quoteTotal', '197.50');
        $snapshot = DirectBookingOrder::query()->sole()->quote_snapshot['existing_reservation'];
        $this->assertSame('deposit', $snapshot['payment_plan']);
        $this->assertSame(39500, $snapshot['receivable_amount_cents']);
        $this->assertSame(19750, $snapshot['pending_amount_cents']);
        $terms = DirectBookingOrder::query()->sole()->accepted_terms_snapshot;
        $this->assertSame('deposit', $terms['payment_plan']);
        $this->assertSame('Entrada de 50% do saldo em aberto da reserva existente.', $terms['payment']);
        $fullPayload = array_replace($payload, ['paymentPlan' => 'full']);
        $this->withHeader('Idempotency-Key', 'deposit-plan-enabled-12345')->postJson('/api/existing-reservations/ZY92K/checkout', $fullPayload)->assertStatus(409);
        $policy = app(ExistingReservationPaymentPlanPolicy::class);
        foreach ([
            'experimental_existing_deposit_enabled',
            'experimental_existing_cycle_settlement_enabled',
            'experimental_existing_ledger_audit_enabled',
        ] as $flag) {
            config(['direct-booking.'.$flag => false]);
            $this->assertFalse($policy->canStartOrderPayment(DirectBookingOrder::query()->sole(), 'pix'));
            config(['direct-booking.'.$flag => true]);
        }
        $reservation = ['price' => ['_f_total' => 395]];
        $unpaid = ['present' => true, 'cents' => 0];
        $this->assertTrue($policy->depositMatches($reservation, ['status' => 'pending_candidate', 'candidate_cents' => 39500], $unpaid));
        $this->assertTrue($policy->depositMatches($reservation, ['status' => 'pending_candidate', 'candidate_cents' => 19750], $unpaid));
        $this->assertFalse($policy->depositMatches($reservation, ['status' => 'pending_candidate', 'candidate_cents' => 30000], $unpaid));
        config(['direct-booking.experimental_existing_deposit_enabled' => false]);
        $recovered = $this->withHeader('Idempotency-Key', 'deposit-plan-enabled-12345')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertOk()->assertJsonPath('payment.enabled', false);
        $this->assertSame($created->json('resume.reference'), $recovered->json('resume.reference'));
        $this->assertSame($created->json('resume.token'), $recovered->json('resume.token'));
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')
            ->assertOk()->assertJsonPath('reservation.paymentPlans.deposit.methods', []);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_unrecorded_balance_can_offer_and_create_a_pix_deposit_under_experimental_guards(): void
    {
        $this->configureCheckout(false);
        config(['direct-booking.experimental_existing_deposit_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => true, 'direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class, function ($mock): void {
            $mock->shouldReceive('confirmsCandidate')->andReturnTrue();
            $mock->shouldReceive('confirmsSnapshot')->andReturnTrue();
        });
        Http::fake(fn (Request $request) => match (true) {
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']),
            str_ends_with($request->url(), '/payments') => Http::response([]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'reserved', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 0], 'partner' => ['name' => 'API booking.com']]),
        });
        $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')->assertOk()
            ->assertJsonPath('reservation.paymentPlans.full.amountCents', 39500)
            ->assertJsonPath('reservation.paymentPlans.deposit.amountCents', 19750)
            ->assertJsonPath('reservation.paymentPlans.deposit.methods', ['pix']);
        $payload = ['expectedBalanceCents' => 39500, 'paymentMethod' => 'pix', 'paymentPlan' => 'deposit', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'deposit-bootstrap-key-123456')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertCreated()->assertJsonPath('order.quoteTotal', '197.50');
        $snapshot = DirectBookingOrder::query()->sole()->quote_snapshot['existing_reservation'];
        $this->assertSame(39500, $snapshot['outstanding_balance_cents']);
        $this->assertSame(19750, $snapshot['pending_amount_cents']);
        $this->assertSame('after_capture', $snapshot['receivable_creation_timing']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_full_plan_rejects_a_receivable_that_is_only_half_the_unpaid_total(): void
    {
        $this->configureCheckout(false);
        Http::fake(fn (Request $request) => str_ends_with($request->url(), '/payments')
            ? Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']])
            : Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), 'type' => 'reserved', 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 0], 'partner' => ['name' => 'API booking.com']]));
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'paymentPlan' => 'full', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'full-plan-partial-123456')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        unset($payload['paymentPlan']);
        foreach ([false, true] as $enabled) {
            config(['direct-booking.experimental_existing_deposit_enabled' => $enabled]);
            $this->withHeader('Idempotency-Key', 'implicit-plan-partial-pix-'.(int) $enabled)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
            $card = array_replace($payload, ['paymentMethod' => 'card', 'installments' => 1]);
            $this->withHeader('Idempotency-Key', 'implicit-plan-partial-card-'.(int) $enabled)->postJson('/api/existing-reservations/ZY92K/checkout', $card)->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
        }
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_legacy_partial_order_can_be_recovered_without_enabling_new_payment(): void
    {
        $this->configureCheckout();
        $key = 'legacy-implicit-replay-test-123';
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        $quote = $order->quote_snapshot;
        $quote['existing_reservation']['reported_paid_cents'] = 0;
        $order->forceFill(['quote_snapshot' => $quote])->save();
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertOk()->assertJsonPath('payment.enabled', false);
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_legacy_reservation_aliases_without_attempt_block_a_second_order(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeader('Idempotency-Key', 'legacy-alias-original-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();

        foreach ([strtoupper(str_repeat('c', 24)), str_repeat('cC', 12), 'ZY92K'] as $index => $alias) {
            $order->forceFill(['stays_reservation_id' => $alias])->save();
            $this->withHeader('Idempotency-Key', 'legacy-alias-new-order-'.($index + 1))->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
                ->assertConflict()->assertJsonPath('code', 'existing_checkout_already_started');
            $this->assertDatabaseCount('direct_booking_orders', 1);
        }
    }

    public function test_new_order_requires_contract_and_legacy_order_remains_replay_only(): void
    {
        $this->configureCheckout();
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix',
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'],
            'acceptedPayment' => true];
        $this->withHeader('Idempotency-Key', 'contract-required-new-order-123')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertConflict()->assertJsonPath('code', 'existing_contract_required');
        $this->assertDatabaseCount('direct_booking_orders', 0);

        $page = $this->getJson('/api/public/legal-pages/contrato')->assertOk()->json('page');
        $payload['acceptedContract'] = ['version' => $page['version'], 'contentHash' => $page['contentHash']];
        $this->withHeader('Idempotency-Key', 'contract-legacy-original-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->sole();
        unset($payload['acceptedContract']);
        $fingerprint = hash_hmac('sha256', json_encode(['ZY92K', 19750, $payload['guest'], 'pix', null, true], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
        $order->forceFill(['accepted_terms_snapshot' => ['version' => 'existing-booking-payment-v1'], 'request_fingerprint' => $fingerprint])->save();
        $this->withHeader('Idempotency-Key', 'contract-legacy-original-order-1')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertOk()->assertJsonPath('code', 'existing_checkout_replay_only')->assertJsonPath('payment.enabled', false);
        $this->assertFalse(app(ExistingReservationPaymentPlanPolicy::class)->canStartOrderPayment($order->fresh(), 'pix'));
    }

    public function test_contract_version_and_exact_content_are_bound_to_new_order(): void
    {
        $this->configureCheckout();
        $page = $this->getJson('/api/public/legal-pages/contrato')->assertOk()->json('page');
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix',
            'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'],
            'acceptedPayment' => true, 'acceptedContract' => ['version' => $page['version'], 'contentHash' => $page['contentHash']]];
        $key = 'existing-contract-version-key-12345';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $order = DirectBookingOrder::query()->where('idempotency_key', $key)->firstOrFail();
        $snapshot = $order->accepted_terms_snapshot;
        $this->assertSame($page['version'], $snapshot['contract']['version']);
        $this->assertSame($page['sections'], $snapshot['contract']['sections']);
        $this->assertSame($page['contentHash'], $snapshot['contract_content_hash']);
        $this->assertSame('full', $snapshot['payment_plan']);
        $this->assertSame('Quitação integral do saldo em aberto da reserva existente.', $snapshot['payment']);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertOk();
        $payload['acceptedContract']['contentHash'] = str_repeat('a', 64);
        $this->withHeader('Idempotency-Key', 'existing-contract-stale-key-12345')->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
            ->assertStatus(409)->assertJsonPath('code', 'existing_contract_changed');
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
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']),
            str_ends_with($request->url(), '/payments') => Http::response([['_idpaymentProvider' => $pendingProvider, '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'reserved', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 197.50], 'partner' => ['name' => 'API booking.com']]),
        });
    }

    /** @return array{acceptedContract: array{version: string, contentHash: string}} */
    private function contractAcceptance(): array
    {
        $contract = app(LegalPageRegistry::class)->find('contrato');
        $this->assertIsArray($contract);

        return ['acceptedContract' => ['version' => $contract['version'], 'contentHash' => hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))]];
    }
}
