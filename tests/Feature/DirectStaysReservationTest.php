<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingStaysAction;
use App\Services\DirectSaleTermsRegistry;
use App\Services\DirectStaysReservationMatcher;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\DirectCheckoutPaymentService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class DirectStaysReservationTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_stays_client_receives_checkout_phone_without_storing_it_in_action_snapshot(): void
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        $order = $this->order(DirectBookingOrderStatus::Cotado);
        $order->update(['stays_client_id' => null, 'guest_phone' => '11999999999', 'guest_cpf' => '12345678909']);
        Http::preventStrayRequests();
        Http::fake([
            '*/booking/clients*' => Http::sequence()->push([], 200)->push(['_id' => '6a3e847be2dd9f1b7508abcd'], 201),
        ]);

        $result = (fn () => $this->resolveClient($order))->call(app(DirectStaysReservationService::class));

        $this->assertTrue($result['ready']);
        Http::assertSent(fn (ClientRequest $request) => $request->method() === 'POST'
            && $request['phones'] === [['iso' => '+5511999999999', 'hint' => 'checkout']]
            && $request['documents'] === [['type' => 'cpf', 'numb' => '12345678909']]);
        $this->assertArrayNotHasKey('phones', $order->staysActions()->where('action_type', 'create_client')->sole()->request_snapshot);
        $this->assertArrayNotHasKey('documents', $order->staysActions()->where('action_type', 'create_client')->sole()->request_snapshot);
        $this->assertNotSame('12345678909', $order->getRawOriginal('guest_cpf'));
    }

    public function test_existing_client_with_different_cpf_is_not_overwritten(): void
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        $order = $this->order(DirectBookingOrderStatus::Cotado);
        $order->update(['stays_client_id' => '6a3e847be2dd9f1b7508abcd', 'guest_cpf' => '12345678909']);
        Http::preventStrayRequests();
        Http::fake(['*/booking/clients/*' => Http::response(['_id' => $order->stays_client_id, 'email' => $order->guest_email, 'documents' => [['type' => 'cpf', 'numb' => '98765432100']]])]);

        $result = (fn () => $this->resolveClient($order))->call(app(DirectStaysReservationService::class));

        $this->assertFalse($result['ready']);
        $this->assertSame('stays_client_cpf_conflict', $result['code']);
        Http::assertNotSent(fn (ClientRequest $request) => $request->method() === 'PATCH');
    }

    #[DataProvider('duplicateClientCases')]
    public function test_duplicate_stays_client_is_reused_only_after_confirming_exact_identity(string $mode, bool $ready): void
    {
        config([
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'test-client',
            'services.stays.client_secret' => 'test-secret',
        ]);
        $order = $this->order(DirectBookingOrderStatus::Cotado);
        $order->update(['stays_client_id' => null]);
        $id = '6a3e847be2dd9f1b7508abcd';
        Http::preventStrayRequests();
        Http::fake(function (ClientRequest $request) use ($mode, $id) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if ($request->method() === 'GET' && str_ends_with($path, '/booking/clients')) {
                return Http::response([], 200);
            }
            if ($request->method() === 'POST' && str_ends_with($path, '/booking/clients')) {
                return Http::response(['metadata' => ['_idclient' => $mode === 'invalid_id' ? '../invalid' : $id]], 409);
            }
            if ($request->method() === 'GET' && str_ends_with($path, '/booking/clients/'.$id)) {
                if ($mode === 'unavailable') {
                    return Http::response([], 503);
                }

                return Http::response(['_id' => $mode === 'different_id' ? 'other' : $id, 'email' => $mode === 'different_email' ? 'other@example.test' : 'TEST@example.test']);
            }
            $this->fail('Unexpected Stays request.');
        });

        $result = (fn () => $this->resolveClient($order))->call(app(DirectStaysReservationService::class));
        $this->assertSame($ready, $result['ready']);
        $this->assertSame($ready ? 'client_ready' : 'stays_client_conflict_unverified', $result['code']);
        $this->assertSame($ready ? $id : '', $result['clientId']);
        $this->assertSame($ready ? 'succeeded' : 'attention_required', $order->staysActions()->where('action_type', 'create_client')->sole()->status);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public static function duplicateClientCases(): array
    {
        return [
            'matching email and id' => ['match', true],
            'different email' => ['different_email', false],
            'different id' => ['different_id', false],
            'invalid id' => ['invalid_id', false],
            'lookup unavailable' => ['unavailable', false],
        ];
    }

    public function test_reservation_total_must_match_quote_even_when_expected_and_hosting_subtotals_differ(): void
    {
        $order = $this->order(DirectBookingOrderStatus::Cotado);
        $reservation = [
            '_id' => 'reservation-with-fees',
            '_idlisting' => $order->stays_listing_id,
            '_idclient' => $order->stays_client_id,
            'type' => 'reserved',
            'checkInDate' => $order->check_in->toDateString(),
            'checkOutDate' => $order->check_out->toDateString(),
            'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
            'guests' => 2,
            'price' => ['currency' => 'BRL', '_f_expected' => 2000, '_f_total' => 3001,
                'hostingDetails' => ['_f_total' => 2900]],
        ];

        $matcher = app(DirectStaysReservationMatcher::class);
        $this->assertTrue($matcher->matchesCommercialDetails($reservation, $order));
        $reservation['price']['_f_total'] = 3600;
        $this->assertFalse($matcher->matchesCommercialDetails($reservation, $order));
        unset($reservation['price']['_f_total']);
        $this->assertFalse($matcher->matchesCommercialDetails($reservation, $order));
    }

    public function test_stays_object_listing_id_matches_quote_but_booked_before_payment_stays_blocked(): void
    {
        $order = $this->order(DirectBookingOrderStatus::Cotado);
        $order->quote_snapshot = ['_idlisting' => '6a32d23cbf733c817978a433'];
        $order->save();
        $reservation = [
            '_id' => 'reservation-prematurely-booked',
            '_idlisting' => '6a32d23cbf733c817978a433',
            '_idclient' => $order->stays_client_id,
            'type' => 'booked',
            'checkInDate' => $order->check_in->toDateString(),
            'checkOutDate' => $order->check_out->toDateString(),
            'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
            'guests' => 2,
            'price' => ['currency' => 'BRL', '_f_expected' => 3001, '_f_total' => 3600],
        ];

        $this->assertTrue(app(DirectStaysReservationMatcher::class)->matchesIdentity($reservation, $order));
        $result = (fn () => $this->adoptReservation($order, 'reservation-prematurely-booked', 60, null, $reservation))
            ->call(app(DirectStaysReservationService::class));

        $this->assertFalse($result['ready']);
        $this->assertSame('stays_reservation_not_reserved', $result['code']);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->refresh()->status);
        $this->assertNull($order->stays_reservation_id);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_late_reserved_response_does_not_reopen_closed_order(): void
    {
        foreach ([DirectBookingOrderStatus::Expirado, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::Concluido] as $status) {
            $order = $this->order($status);
            $order->reservation_status = 'canceled';
            $order->expires_at = null;
            $order->save();

            $reservation = [
                '_id' => 'late-reservation',
                '_idlisting' => $order->stays_listing_id,
                '_idclient' => $order->stays_client_id,
                'type' => 'reserved',
                'checkInDate' => $order->check_in->toDateString(),
                'checkOutDate' => $order->check_out->toDateString(),
                'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
                'guests' => 2,
                'price' => ['currency' => 'BRL', '_f_expected' => 3001],
            ];

            $result = (fn () => $this->adoptReservation($order, 'late-reservation', 60, null, $reservation))
                ->call(app(DirectStaysReservationService::class));

            $this->assertFalse($result['ready']);
            $this->assertSame($status, $order->refresh()->status);
            $this->assertSame('canceled', $order->reservation_status);
            $this->assertNull($order->stays_reservation_id);
            $this->assertNull($order->expires_at);
            $this->assertSame('stays_reserved_after_order_closed', $order->operational_events[array_key_last($order->operational_events)]['event']);
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-24T17:00:00Z'));
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.resume_token_ttl_days' => 30,
            'direct-booking.reservation_hold_minutes' => 60,
            'services.stays.client_id' => 'test-client',
            'services.stays.client_secret' => 'test-secret',
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'cache.default' => 'array',
        ]);
        Http::preventStrayRequests();
    }

    public function test_checkout_creates_reservation_after_stays_returns_duplicate_client_conflict(): void
    {
        $this->approvedTerms();
        $clientId = '6a3e847be2dd9f1b7508abcd';
        Http::preventStrayRequests();
        Http::fake(function (ClientRequest $request) use ($clientId) {
            if ($response = $this->checkoutStaysResponse($request)) {
                return $response;
            }
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            if ($request->method() === 'GET' && str_ends_with($path, '/booking/clients')) {
                return Http::response([]);
            }
            if ($request->method() === 'POST' && str_ends_with($path, '/booking/clients')) {
                return Http::response(['metadata' => ['_idclient' => $clientId]], 409);
            }
            if ($request->method() === 'GET' && str_ends_with($path, '/booking/clients/'.$clientId)) {
                return Http::response(['_id' => $clientId, 'email' => 'checkout@example.test']);
            }
            if ($request->method() === 'POST' && str_ends_with($path, '/booking/reservations')) {
                return Http::response($this->reservationFrom($request->data(), 'reservation-conflict'), 201);
            }

            return Http::response([], 404);
        });
        $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'duplicate-client-checkout-001'])
            ->assertCreated()->assertJsonPath('order.status', 'pre_reservado');
        $this->assertSame($clientId, DirectBookingOrder::query()->sole()->stays_client_id);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
    }

    public function test_checkout_creates_and_persists_reserved_and_resume_contract_with_payment_readiness(): void
    {
        $this->approvedTerms();
        Http::fake(function (ClientRequest $request) {
            if ($checkoutResponse = $this->checkoutStaysResponse($request)) {
                return $checkoutResponse;
            }
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/clients')) {
                return $request->method() === 'GET' ? Http::response([], 200) : Http::response(['_id' => 'client-1'], 201);
            }
            if (str_ends_with((string) $path, '/booking/reservations')) {
                return match ($request->method()) {
                    'POST' => Http::response($this->reservationFrom($request->data(), 'reservation-1'), 201),
                    'GET' => Http::response([$this->reservationFrom($request->data(), 'reservation-1')], 200),
                    default => Http::response([], 404),
                };
            }

            return Http::response([], 404);
        });

        $response = $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'direct-reserve-attempt-001'])
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('code', 'pre_reserved')
            ->assertJsonPath('order.status', 'pre_reservado')
            ->assertJsonPath('payment.enabled', true)
            ->assertJsonPath('payment.methods', ['pix']);

        $publicReference = $response->json('order.publicReference');
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->firstOrFail();
        $this->assertSame('reserved', $order->reservation_status);
        $this->assertSame('reservation-1', $order->stays_reservation_id);
        $this->assertSame('client-1', $order->stays_client_id);
        $this->assertNotNull($order->expires_at);
        $this->assertSame('succeeded', DirectBookingStaysAction::query()->where('action_type', 'create_reservation')->value('status'));
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/booking/reservations')
            && ($request->data()['type'] ?? null) === 'reserved'
            && ! array_key_exists('price', $request->data()));

        $resume = $response->json('resume');
        $this->assertSame('/checkout/'.$order->public_reference, $resume['path']);
        $this->getJson('/api/checkout/'.$resume['reference'], ['X-Checkout-Resume-Token' => $resume['token']])
            ->assertOk()->assertJsonPath('order.status', 'pre_reservado')->assertJsonPath('payment.enabled', true);
        $this->getJson('/api/checkout/'.$resume['reference'].'?quoteTotal=0&acceptedTerms=false', ['X-Checkout-Resume-Token' => 'wrong-token'])
            ->assertNotFound();
    }

    public function test_checkout_rejects_35_minute_hold_without_creating_stays_client_or_reservation(): void
    {
        config(['direct-booking.reservation_hold_minutes' => 35]);
        $this->approvedTerms();
        Http::fake(function (ClientRequest $request) {
            if ($checkoutResponse = $this->checkoutStaysResponse($request)) {
                return $checkoutResponse;
            }

            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/clients')) {
                return Http::response(['_id' => 'client-35'], 201);
            }
            if (str_ends_with((string) $path, '/booking/reservations')) {
                return Http::response($this->reservationFrom($request->data(), 'reservation-35'), 201);
            }

            return Http::response([], 404);
        });

        $response = $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'direct-reserve-hold-035'])
            ->assertServiceUnavailable()
            ->assertJsonPath('code', 'reservation_hold_too_short_for_pix');

        $order = DirectBookingOrder::query()->where('public_reference', $response->json('order.publicReference'))->firstOrFail();
        $this->assertNull($order->stays_client_id);
        $this->assertNull($order->stays_reservation_id);
        $this->assertSame(0, DirectBookingStaysAction::query()->count());
        Http::assertNotSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && preg_match('~/booking/(clients|reservations)$~', (string) parse_url($request->url(), PHP_URL_PATH)) === 1);
    }

    public function test_checkout_accepts_36_minute_hold_and_creates_reserved_in_stays(): void
    {
        config(['direct-booking.reservation_hold_minutes' => 36]);
        $this->approvedTerms();
        Http::fake(function (ClientRequest $request) {
            if ($checkoutResponse = $this->checkoutStaysResponse($request)) {
                return $checkoutResponse;
            }

            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/clients')) {
                return $request->method() === 'GET' ? Http::response([], 200) : Http::response(['_id' => 'client-36'], 201);
            }
            if (str_ends_with((string) $path, '/booking/reservations')) {
                return $request->method() === 'POST'
                    ? Http::response($this->reservationFrom($request->data(), 'reservation-36'), 201)
                    : Http::response([], 404);
            }

            return Http::response([], 404);
        });

        $response = $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'direct-reserve-hold-036'])
            ->assertCreated()
            ->assertJsonPath('code', 'pre_reserved');

        $order = DirectBookingOrder::query()->where('public_reference', $response->json('order.publicReference'))->firstOrFail();
        $this->assertSame('client-36', $order->stays_client_id);
        $this->assertSame('reservation-36', $order->stays_reservation_id);
        $this->assertSame('reserved', $order->reservation_status);
        $this->assertSame('succeeded', DirectBookingStaysAction::query()->where('action_type', 'create_reservation')->value('status'));
    }

    public function test_reservation_timeout_is_reconciled_without_repeating_post(): void
    {
        $this->approvedTerms();
        $reservationPosts = 0;
        Http::fake(function (ClientRequest $request) use (&$reservationPosts) {
            if ($checkoutResponse = $this->checkoutStaysResponse($request)) {
                return $checkoutResponse;
            }
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/clients')) {
                return $request->method() === 'GET' ? Http::response([], 200) : Http::response(['_id' => 'client-2'], 201);
            }
            if (str_ends_with((string) $path, '/booking/reservations')) {
                if ($request->method() === 'POST') {
                    $reservationPosts++;

                    return Http::failedConnection();
                }

                return Http::response([], 200);
            }

            return Http::response([], 404);
        });

        $response = $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'direct-reserve-attempt-002'])
            ->assertServiceUnavailable()->assertJsonPath('code', 'stays_reservation_write_unknown')->assertJsonPath('order.status', 'atencao_operacional');
        $this->assertSame(1, $reservationPosts);
        $this->assertSame('attention_required', DirectBookingStaysAction::query()->where('action_type', 'create_reservation')->value('status'));

        $resume = $response->json('resume');
        $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'direct-reserve-attempt-002'])
            ->assertServiceUnavailable()->assertJsonPath('idempotentReplay', true);
        $this->assertSame(1, $reservationPosts);
    }

    #[DataProvider('releasableExpiredStates')]
    public function test_expired_reservation_is_canceled_and_verified_before_order_expires(DirectBookingOrderStatus $initialStatus): void
    {
        $order = $this->order($initialStatus, 'reservation-expiring');
        $order->expires_at = now()->subMinute();
        $order->reservation_status = 'reserved';
        $order->save();
        $seenPatch = false;
        Http::fake(function (ClientRequest $request) use (&$seenPatch, $order) {
            $method = $request->method();
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/reservations/reservation-expiring')) {
                if ($method === 'PATCH') {
                    $seenPatch = true;

                    return Http::response(['_id' => 'reservation-expiring', 'type' => 'canceled'], 200);
                }

                return Http::response(['_id' => 'reservation-expiring', '_idlisting' => 'JQ08G', '_idclient' => 'client-3', 'checkInDate' => '2026-11-10', 'checkOutDate' => '2026-11-13', 'type' => $seenPatch ? 'canceled' : 'reserved', 'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id], 200);
            }

            return Http::response([], 404);
        });

        app(DirectStaysReservationService::class)->recover();
        $order->refresh();
        $this->assertTrue($seenPatch);
        $this->assertSame(DirectBookingOrderStatus::Expirado, $order->status);
        $this->assertSame('canceled', $order->reservation_status);
        $this->assertSame('succeeded', DirectBookingStaysAction::query()->where('action_type', 'cancel_reservation')->value('status'));
    }

    public static function releasableExpiredStates(): array
    {
        return ['no payment' => [DirectBookingOrderStatus::PreReservado], 'expired unpaid Pix' => [DirectBookingOrderStatus::LiberacaoPendente]];
    }

    private function approvedTerms(): void
    {
        $this->partialMock(DirectCheckoutPaymentService::class)
            ->shouldReceive('availableMethods')
            ->andReturn(['pix']);
        $snapshot = ['version' => 'terms-test-1', 'cancelamento' => 'Condições específicas da acomodação.'];
        $this->mock(DirectSaleTermsRegistry::class)->shouldReceive('findApprovedListing')->once()->andReturn([
            'id' => 'JQ08G', 'staysListingId' => 'JQ08G', 'maxGuests' => 5,
            'directSaleTermsVersion' => 'terms-test-1', 'directSaleTermsSnapshot' => $snapshot,
        ]);
    }

    private function checkoutStaysResponse(ClientRequest $request): mixed
    {
        $path = parse_url($request->url(), PHP_URL_PATH);
        if (str_ends_with((string) $path, '/booking/search-listings')) {
            return Http::response([['id' => 'JQ08G']], 200);
        }
        if (str_ends_with((string) $path, '/booking/calculate-price')) {
            return Http::response([['_idlisting' => 'JQ08G', 'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true, 'fees' => []]]], 200);
        }

        return null;
    }

    public function test_confirmed_stays_reservation_does_not_queue_a_duplicate_guest_email_by_default(): void
    {
        config(['direct-booking.send_confirmation_email' => false]);
        $order = $this->order(DirectBookingOrderStatus::PagoEmConfirmacao, 'reservation-email-managed-by-stays');
        $order->forceFill(['payment_status' => 'approved', 'reservation_status' => 'booked'])->save();

        $order->transitionTo(DirectBookingOrderStatus::Confirmado, ['source' => 'stays_booked_verified']);
        $order->save();

        $this->assertDatabaseCount('direct_booking_emails', 0);
    }

    private function checkoutPayload(): array
    {
        return [
            'listingId' => 'JQ08G', 'from' => '2026-11-10', 'to' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0], 'quoteTotal' => 3001,
            'guest' => ['fullName' => 'Checkout Guest', 'email' => 'checkout@example.test', 'phone' => '+5511999999999'],
            'acceptedTermsVersion' => 'terms-test-1', 'acceptedTerms' => true,
        ];
    }

    private function order(DirectBookingOrderStatus $status, ?string $reservationId = null): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => $status, 'idempotency_key' => 'test-'.uniqid(), 'public_reference' => bin2hex(random_bytes(20)),
            'resume_token' => bin2hex(random_bytes(32)), 'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'stays_client_id' => 'client-3', 'reservation_status' => 'reserved', 'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Test Guest', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => ['version' => 'terms-test-1'],
            'terms_accepted_at' => now(), 'origin' => 'website', 'expires_at' => now()->subMinute(), 'stays_reservation_id' => $reservationId, 'operational_events' => [],
        ]);
    }

    /** @param array<string, mixed> $requestData
     * @return array<string, mixed>
     */
    private function reservationFrom(array $requestData, string $id): array
    {
        return ['_id' => $id, '_idlisting' => $requestData['listingId'] ?? 'JQ08G', '_idclient' => $requestData['_idclient'] ?? 'client-1', 'type' => $requestData['type'] ?? 'reserved', 'checkInDate' => $requestData['checkInDate'] ?? '2026-11-10', 'checkOutDate' => $requestData['checkOutDate'] ?? '2026-11-13', 'guests' => $requestData['guests'] ?? 2, 'guestsDetails' => $requestData['guestsDetails'] ?? ['adults' => 2, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 3001], 'internalNote' => $requestData['internalNote'] ?? ''];
    }
}
