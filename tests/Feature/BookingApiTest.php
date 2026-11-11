<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use App\Models\GuestProfile;
use App\Services\DirectSaleTermsRegistry;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\DirectCheckoutPaymentService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BookingApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-24T17:00:00Z'));
    }

    public function test_local_price_fallback_returns_existing_response_shape(): void
    {
        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
        $this->postJson('/api/price', ['listingIds' => ['JQ08G'], 'from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])
            ->assertOk()->assertJsonPath('success', true)->assertJsonPath('nights', 3)->assertJsonPath('source', 'local-fallback')->assertJsonStructure(['dailyRate', 'baseTotal', 'cleaningFee', 'serviceFee', 'total', 'breakdown']);
    }

    public function test_price_rejects_invalid_date_ranges(): void
    {
        $this->postJson('/api/price', ['listingId' => 'JQ08G', 'from' => '2026-11-12', 'to' => '2026-11-10', 'guests' => 2])->assertUnprocessable();
    }

    public function test_dated_search_fails_closed_when_live_availability_is_unavailable(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret', 'services.stays.base_url' => 'https://crcn.stays.net/external/v1']);
        Http::fake(['*' => Http::response(['error' => 'unavailable'], 503)]);
        $this->postJson('/api/search', ['from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])->assertStatus(503)->assertJsonPath('code', 'availability_unavailable');
    }

    public function test_stays_status_reports_missing_credentials_without_exposing_secrets(): void
    {
        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
        $this->getJson('/api/stays/status')->assertStatus(503)->assertJsonPath('hasCredentials', false)->assertJsonMissingPath('clientSecret');
    }

    public function test_stays_status_reports_the_live_listing_count(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(function (ClientRequest $request): mixed {
            return Http::response(
                str_contains($request->url(), 'skip=50')
                    ? [['id' => 'listing-51']]
                    : array_fill(0, 50, ['id' => 'live-listing']),
                200,
            );
        });

        $this->getJson('/api/stays/status')
            ->assertOk()
            ->assertJsonPath('connected', true)
            ->assertJsonPath('totalProperties', 51);

        Http::assertSent(fn (ClientRequest $request): bool => str_contains($request->url(), 'skip=50'));
    }

    public function test_stays_status_reports_zero_when_the_live_catalog_is_empty(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*' => Http::response([], 200)]);

        $this->getJson('/api/stays/status')
            ->assertOk()
            ->assertJsonPath('connected', true)
            ->assertJsonPath('totalProperties', 0);
    }

    public function test_stays_status_fails_when_a_live_listing_page_is_unavailable(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret']);
        Http::fake(['*' => Http::response(['error' => 'unavailable'], 503)]);

        $this->getJson('/api/stays/status')
            ->assertStatus(503)
            ->assertJsonPath('connected', false)
            ->assertJsonPath('hasCredentials', true);
    }

    public function test_guest_routes_require_authentication(): void
    {
        $this->getJson('/api/my-reservations')->assertUnauthorized()->assertJsonPath('code', 'authentication_required');
        $this->postJson('/api/owner/access/request', [])->assertUnauthorized();
    }

    public function test_reservations_use_verified_guest_details_and_are_not_cached(): void
    {
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.stays.client_id' => 'stays-client-id',
            'services.stays.client_secret' => 'stays-client-secret',
        ]);
        Http::fake([
            '*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']], 200),
            '*/booking/clients/stays-client-1' => Http::response(['client' => ['reservations' => [[
                '_id' => 'reservation-pending-1',
                '_idlisting' => 'JQ08G',
                'checkInDate' => '2026-11-10',
                'checkOutDate' => '2026-11-13',
                'type' => 'reserved',
                'bookerDetails' => ['name' => 'Unverified Name', 'email' => 'unverified@example.test'],
                'price' => ['_f_total' => 3001],
            ]]]], 200),
        ]);
        GuestProfile::query()->create([
            'id' => '575c8054-6646-443c-bf62-07945019a32f',
            'full_name' => 'Guest Example',
            'stays_client_id' => 'stays-client-1',
        ]);

        $this->withToken('valid-access-token')->getJson('/api/my-reservations')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.0.paymentMethod', '')
            ->assertJsonPath('data.0.guestName', 'Guest Example')
            ->assertJsonPath('data.0.guestEmail', 'guest@example.test')
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_valid_supabase_session_can_request_owner_access_in_local_database(): void
    {
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']], 200)]);
        $this->withToken('valid-access-token')->postJson('/api/owner/access/request')->assertOk()->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('owner_access', ['user_id' => '575c8054-6646-443c-bf62-07945019a32f', 'status' => 'pending']);
    }

    public function test_owner_admin_routes_reject_non_admin_users(): void
    {
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']], 200)]);
        $this->withToken('valid-access-token')->getJson('/api/owner/admin/requests')->assertForbidden()->assertJsonPath('code', 'owner_admin_forbidden');
    }

    public function test_sofia_uses_deterministic_catalog_answer_without_openai_credentials(): void
    {
        config(['services.openai.api_key' => '']);
        $this->postJson('/api/sofia/chat', ['message' => 'Quero apartamentos para 4 pessoas com piscina'])->assertOk()->assertJsonPath('assistant', 'catalog')->assertJsonPath('totalFound', 19)->assertJsonCount(4, 'matchedProperties');
    }

    public function test_checkout_returns_422_for_guest_request_without_an_idempotency_key(): void
    {
        Http::preventStrayRequests();

        $this->postJson('/api/checkout', $this->checkoutPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('idempotencyKey');

        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_is_disabled_by_default_without_creating_an_order(): void
    {
        Http::preventStrayRequests();

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-disabled-attempt-01'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'checkout_disabled')
            ->assertJsonPath('payment.enabled', false)
            ->assertJsonPath('message', 'A compra no site está em preparação. Nenhum pedido, pré-reserva ou pagamento foi iniciado.');

        $this->assertDatabaseCount('direct_booking_orders', 0);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
    }

    public function test_checkout_idempotency_does_not_depend_on_cache_locks(): void
    {
        $this->mockAvailablePaymentMethods();
        $this->configureCheckoutPaymentReadiness();
        config([
            'cache.default' => 'null',
        ]);
        $this->mock(DirectSaleTermsRegistry::class)->shouldReceive('findApprovedListing')->once()->andReturn(null);
        Http::preventStrayRequests();

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-attempt-00005'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'checkout_conditions_unavailable');

        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_returns_503_for_unapproved_property_terms_without_creating_an_order(): void
    {
        $this->mockAvailablePaymentMethods();
        config([
            'direct-booking.enabled' => true,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);
        $this->configureCheckoutPaymentReadiness();
        $this->mock(DirectSaleTermsRegistry::class)
            ->shouldReceive('findApprovedListing')
            ->once()
            ->with('JQ08G')
            ->andReturn(null);
        Http::preventStrayRequests();

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-attempt-00001'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'checkout_conditions_unavailable');

        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_requires_an_external_mailer_only_when_its_own_confirmation_email_is_enabled(): void
    {
        $this->configureCheckoutPaymentReadiness();
        config(['direct-booking.send_confirmation_email' => true]);
        Http::preventStrayRequests();

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-email-opt-in-001'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'payments_disabled');

        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_returns_503_when_accepted_terms_version_does_not_match_the_server_version(): void
    {
        $this->configureApprovedCheckoutTerms();
        Http::preventStrayRequests();

        $this->postJson('/api/checkout', $this->checkoutPayload(3001, 'outdated-terms'), ['Idempotency-Key' => 'checkout-attempt-00004'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'checkout_conditions_unavailable');

        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_returns_409_for_a_changed_live_quote_without_persisting_an_order(): void
    {
        $this->configureApprovedCheckoutTerms();
        $requestOrder = [];
        $this->fakeDirectCheckoutRequests(3002, $requestOrder);

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-attempt-00002'])
            ->assertConflict()
            ->assertJsonPath('code', 'quote_changed');

        $this->assertSame(['POST /booking/search-listings', 'POST /booking/calculate-price'], $requestOrder);
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_rejects_malformed_or_wrong_listing_quote_without_creating_an_order(): void
    {
        $this->configureApprovedCheckoutTerms();
        $requestOrder = [];
        $this->fakeDirectCheckoutRequests(3001, $requestOrder, [
            'invalid quote entry',
            ['_idlisting' => 'OTHER-LISTING', 'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true]],
        ]);

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-wrong-quote-0001'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'quote_unavailable');

        $this->assertSame(['POST /booking/search-listings', 'POST /booking/calculate-price'], $requestOrder);
        $this->assertDatabaseCount('direct_booking_orders', 0);
        $this->assertDatabaseCount('direct_booking_stays_actions', 0);
    }

    public function test_checkout_rejects_live_capacity_below_requested_guests(): void
    {
        $this->configureApprovedCheckoutTerms();
        $requestOrder = [];
        $this->fakeDirectCheckoutRequests(3001, $requestOrder, availabilityResponse: [['id' => 'JQ08G', '_i_maxGuests' => 1]]);

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-live-capacity-01'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'invalid_guest_count');
        $this->assertSame(['POST /booking/search-listings'], $requestOrder);
        $this->assertDatabaseCount('direct_booking_orders', 0);
    }

    public function test_checkout_accepts_single_listing_quote_without_identifier(): void
    {
        $this->configureApprovedCheckoutTerms();
        $requestOrder = [];
        $this->fakeDirectCheckoutRequests(3001, $requestOrder, [
            'bookingPrice' => ['_mctotal' => ['BRL' => 3001], 'feesIncluded' => true, 'fees' => []],
        ]);

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-single-quote-01'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_unconfigured');
        $this->assertDatabaseCount('direct_booking_orders', 1);
    }

    public function test_checkout_returns_503_and_replays_the_same_order_without_additional_stays_calls(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-24T17:00:00Z'));
        $termsSnapshot = ['version' => 'terms-2026-01', 'cancelamento' => 'Política específica deste imóvel.'];
        $this->configureApprovedCheckoutTerms($termsSnapshot);
        $requestOrder = [];
        $this->fakeDirectCheckoutRequests(3001, $requestOrder);
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('reserve')
            ->twice()
            ->andReturn([
                'ready' => false,
                'code' => 'reservation_hold_unconfigured',
                'message' => 'A pré-reserva não está configurada.',
            ]);
        $payload = $this->checkoutPayload(3001);
        $payload['marketingAttribution'] = [
            'firstTouch' => [
                'capturedAt' => 1792861200000,
                'values' => ['utm_source' => 'google', 'utm_campaign' => 'summer_launch', 'gclid' => 'click-id-123'],
            ],
            'lastTouch' => [
                'capturedAt' => 1792861300000,
                'values' => ['utm_source' => 'meta', 'utm_medium' => 'paid_social', 'fbclid' => 'meta-click-456'],
            ],
        ];

        $first = $this->postJson('/api/checkout', $payload, ['Idempotency-Key' => 'checkout-attempt-00003'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_unconfigured')
            ->assertJsonPath('order.status', 'cotado')
            ->assertJsonPath('idempotentReplay', false);
        $publicReference = $first->json('order.publicReference');
        $this->assertIsString($publicReference);

        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->firstOrFail();
        $this->assertModelExists($order);
        $this->assertSame($termsSnapshot, $order->accepted_terms_snapshot);
        $this->assertSame($payload['marketingAttribution'], $order->marketing_attribution);
        $this->assertSame(1, DirectBookingOrder::query()->count());

        $replayedPayload = [...$payload, 'marketingAttribution' => [
            ...$payload['marketingAttribution'],
            'lastTouch' => ['capturedAt' => 1792861400000, 'values' => ['utm_source' => 'email']],
        ]];
        $this->postJson('/api/checkout', $replayedPayload, ['Idempotency-Key' => 'checkout-attempt-00003'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_unconfigured')
            ->assertJsonPath('order.publicReference', $publicReference)
            ->assertJsonPath('idempotentReplay', true);

        $this->postJson('/api/checkout', [...$payload, 'guest' => [...$payload['guest'], 'fullName' => 'Another Guest']], ['Idempotency-Key' => 'checkout-attempt-00003'])
            ->assertConflict()
            ->assertJsonPath('code', 'idempotency_key_reused');

        $this->assertSame(['POST /booking/search-listings', 'POST /booking/calculate-price'], $requestOrder);
        $this->assertSame(1, DirectBookingOrder::query()->count());
    }

    public function test_checkout_rejects_unapproved_marketing_attribution_fields(): void
    {
        $payload = $this->checkoutPayload(3001);
        $payload['marketingAttribution'] = [
            'firstTouch' => ['capturedAt' => 1792861200000, 'values' => ['utm_source' => 'google', 'email' => 'guest@example.test']],
            'lastTouch' => ['capturedAt' => 1792861300000, 'values' => ['utm_source' => 'google']],
        ];

        $this->postJson('/api/checkout', $payload, ['Idempotency-Key' => 'checkout-attribution-invalid-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('marketingAttribution.firstTouch.values');
    }

    public function test_checkout_rejects_implausible_marketing_attribution_timestamps(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-24T17:00:00Z'));
        $now = now()->valueOf();
        $cases = [
            'seconds instead of milliseconds' => (int) floor($now / 1000),
            'older than the attribution retention window' => $now - (30 * 24 * 60 * 60 * 1000) - 1,
            'beyond the future clock tolerance' => $now + (5 * 60 * 1000) + 1,
        ];

        foreach ($cases as $case => $capturedAt) {
            $payload = $this->checkoutPayload(3001);
            $payload['marketingAttribution'] = [
                'firstTouch' => ['capturedAt' => $capturedAt, 'values' => ['utm_source' => 'google']],
                'lastTouch' => ['capturedAt' => $now, 'values' => ['utm_source' => 'google']],
            ];

            $this->postJson('/api/checkout', $payload, ['Idempotency-Key' => 'checkout-attribution-time-'.str_replace(' ', '-', $case)])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('marketingAttribution.firstTouch.capturedAt');
        }
    }

    public function test_checkout_applies_exact_attribution_timestamp_boundaries_and_accepts_null_or_omitted_attribution(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-24T17:00:00Z'));
        $now = now()->valueOf();
        $this->configureApprovedCheckoutTerms(expectedLookupCount: 3);
        $requestOrder = [];
        $this->fakeDirectCheckoutRequests(3001, $requestOrder);

        $atOldestBoundary = $this->checkoutPayload(3001);
        $atOldestBoundary['marketingAttribution'] = [
            'firstTouch' => ['capturedAt' => $now - (30 * 24 * 60 * 60 * 1000), 'values' => ['utm_source' => 'google']],
            'lastTouch' => ['capturedAt' => $now, 'values' => ['utm_source' => 'google']],
        ];
        $this->postJson('/api/checkout', $atOldestBoundary, ['Idempotency-Key' => 'checkout-attribution-old-boundary-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('marketingAttribution.firstTouch.capturedAt');

        $atFutureBoundary = $this->checkoutPayload(3001);
        $atFutureBoundary['marketingAttribution'] = [
            'firstTouch' => ['capturedAt' => $now, 'values' => ['utm_source' => 'google']],
            'lastTouch' => ['capturedAt' => $now + (5 * 60 * 1000), 'values' => ['utm_source' => 'google']],
        ];
        $this->postJson('/api/checkout', $atFutureBoundary, ['Idempotency-Key' => 'checkout-attribution-future-boundary-01'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_unconfigured');

        $nullAttribution = $this->checkoutPayload(3001);
        $nullAttribution['marketingAttribution'] = null;
        $this->postJson('/api/checkout', $nullAttribution, ['Idempotency-Key' => 'checkout-attribution-null-00001'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_unconfigured');

        $this->postJson('/api/checkout', $this->checkoutPayload(3001), ['Idempotency-Key' => 'checkout-attribution-omitted-01'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_unconfigured');
    }

    private function checkoutPayload(?float $quoteTotal = null, string $termsVersion = 'terms-2026-01'): array
    {
        return array_filter([
            'listingId' => 'JQ08G',
            'from' => '2026-11-10',
            'to' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0],
            'quoteTotal' => $quoteTotal,
            'guest' => ['fullName' => 'Checkout Guest', 'email' => 'checkout@example.test', 'phone' => '+5511999999999'],
            'acceptedTermsVersion' => $termsVersion,
            'acceptedTerms' => true,
        ], fn (mixed $value): bool => $value !== null);
    }

    private function configureApprovedCheckoutTerms(array $snapshot = ['version' => 'terms-2026-01', 'cancelamento' => 'Política específica deste imóvel.'], int $expectedLookupCount = 1): void
    {
        $this->mockAvailablePaymentMethods();
        config(['direct-booking.enabled' => true, 'cache.default' => 'array']);
        $this->configureCheckoutPaymentReadiness();
        config([
            'cache.default' => 'array',
            'direct-booking.reservation_hold_minutes' => null,
        ]);
        app('cache')->forgetDriver('array');
        $this->mock(DirectSaleTermsRegistry::class)
            ->shouldReceive('findApprovedListing')
            ->times($expectedLookupCount)
            ->with('JQ08G')
            ->andReturn([
                'id' => 'JQ08G',
                'staysListingId' => 'JQ08G',
                'maxGuests' => 5,
                'directSaleTermsVersion' => 'terms-2026-01',
                'directSaleTermsSnapshot' => $snapshot,
            ]);
    }

    private function mockAvailablePaymentMethods(): void
    {
        config([
            'direct-booking.resume_token_ttl_days' => 30,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
        ]);
        $this->partialMock(DirectCheckoutPaymentService::class)
            ->shouldReceive('availableMethods')
            ->andReturn(['pix']);
    }

    /** @param list<string> $requestOrder */
    private function fakeDirectCheckoutRequests(float $total, array &$requestOrder, ?array $quoteResponse = null, ?array $availabilityResponse = null): void
    {
        config([
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.base_url' => 'https://crcn.stays.net/external/v1',
            'cache.default' => 'array',
        ]);
        app('cache')->forgetDriver('array');
        Http::preventStrayRequests();
        Http::fake(function (ClientRequest $request) use ($total, &$requestOrder, $quoteResponse, $availabilityResponse) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            $requestOrder[] = $request->method().' '.str_replace('/external/v1', '', (string) $path);

            return match (true) {
                str_ends_with((string) $path, '/booking/search-listings') => Http::response($availabilityResponse ?? [['id' => 'JQ08G']], 200),
                str_ends_with((string) $path, '/booking/calculate-price') => Http::response($quoteResponse ?? [['_idlisting' => 'JQ08G', 'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => $total], 'feesIncluded' => true, 'fees' => []]]], 200),
                default => Http::response([], 404),
            };
        });
    }

    private function configureCheckoutPaymentReadiness(): void
    {
        config([
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.send_confirmation_email' => false,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
            'direct-booking.reservation_hold_minutes' => 60,
            'direct-booking.notification_queue_connection' => 'database',
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.mercadopago.access_token' => 'test-access-token',
            'services.mercadopago.webhook_secret' => 'test-webhook-secret',
            'services.mercadopago.webhook_queue_connection' => 'database',
            'mail.default' => 'log',
        ]);
    }
}
