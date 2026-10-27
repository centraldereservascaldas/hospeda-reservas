<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use App\Services\DirectSaleTermsRegistry;
use App\Services\DirectStaysPaymentService;
use App\Services\DirectStaysReservationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DirectStaysReservationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'direct-booking.enabled' => true,
            'direct-booking.reservation_hold_minutes' => 30,
            'services.stays.client_id' => 'test-client',
            'services.stays.client_secret' => 'test-secret',
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'cache.default' => 'array',
        ]);
        Http::preventStrayRequests();
    }

    public function test_checkout_does_not_create_order_or_stays_reservation_when_payments_are_disabled(): void
    {
        $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'direct-reserve-attempt-001'])
            ->assertServiceUnavailable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'payments_disabled');

        $this->assertDatabaseCount('direct_booking_orders', 0);
        Http::assertNothingSent();
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

    public function test_reservation_timeout_is_reconciled_without_repeating_post(): void
    {
        $this->enableTestPayments();
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

    public function test_expired_reservation_is_canceled_and_verified_before_order_expires(): void
    {
        $order = $this->order(DirectBookingOrderStatus::PreReservado, 'reservation-expiring');
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

    public function test_cielo_checkout_payment_is_registered_with_cielo_identity_in_stays(): void
    {
        [$order, $reservation, $attempt] = $this->paidCieloReservationScenario();
        config([
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
        ]);
        $postedPayment = null;
        Http::fake(function (ClientRequest $request) use ($reservation, &$postedPayment) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/reservations/reservation-cielo')) {
                return Http::response($reservation, 200);
            }
            if (str_ends_with((string) $path, '/booking/reservations/reservation-cielo/payments')) {
                if ($request->method() === 'POST') {
                    $postedPayment = $request->data();

                    return Http::response([...$postedPayment, '_id' => 'stays-payment-cielo'], 201);
                }

                return Http::response([], 200);
            }

            return Http::response([], 404);
        });

        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);

        $this->assertTrue($result['ready']);
        $this->assertSame('CRCN Checkout Cielo', $postedPayment['name']);
        $this->assertSame('CRCN_DIRECT_ORDER:'.$order->id.':CIELO_CHECKOUT:'.$attempt->gateway_payment_id, $postedPayment['desc']);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->refresh()->status);
    }

    public function test_cielo_checkout_reconciles_legacy_mercado_pago_marker_without_duplicate_stays_write(): void
    {
        [$order, $reservation, $attempt] = $this->paidCieloReservationScenario();
        config([
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
        ]);
        $paymentPosts = 0;
        $legacyPayment = [
            '_id' => 'legacy-stays-payment',
            '_f_val' => 3001,
            'status' => 'completed',
            'type' => 'credit',
            '_idpaymentProvider' => 'test-provider',
            'desc' => 'CRCN_DIRECT_ORDER:'.$order->id.':MP:'.$attempt->gateway_payment_id,
        ];
        Http::fake(function (ClientRequest $request) use ($reservation, $legacyPayment, &$paymentPosts) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with((string) $path, '/booking/reservations/reservation-cielo')) {
                return Http::response($reservation, 200);
            }
            if (str_ends_with((string) $path, '/booking/reservations/reservation-cielo/payments')) {
                if ($request->method() === 'POST') {
                    $paymentPosts++;

                    return Http::response([], 201);
                }

                return Http::response([$legacyPayment], 200);
            }

            return Http::response([], 404);
        });

        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);

        $this->assertTrue($result['ready']);
        $this->assertSame(0, $paymentPosts);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->refresh()->status);
    }

    private function approvedTerms(): void
    {
        $snapshot = ['version' => 'terms-test-1', 'cancelamento' => 'Condições específicas da acomodação.'];
        $this->mock(DirectSaleTermsRegistry::class)->shouldReceive('findApprovedListing')->once()->andReturn([
            'id' => 'JQ08G', 'staysListingId' => 'JQ08G', 'maxGuests' => 5,
            'directSaleTermsVersion' => 'terms-test-1', 'directSaleTermsSnapshot' => $snapshot,
        ]);
    }

    private function enableTestPayments(): void
    {
        config([
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.reservation_hold_minutes' => 60,
            'direct-booking.pix_minimum_remaining_minutes' => 10,
            'direct-booking.payment_safety_margin_minutes' => 5,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
            'services.cielo.merchant_id' => 'test-merchant',
            'services.cielo.sop_client_id' => 'test-cielo-client',
            'services.cielo.sop_client_secret' => 'test-cielo-secret',
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

    /** @return array{DirectBookingOrder, array<string, mixed>, DirectBookingPaymentAttempt} */
    private function paidCieloReservationScenario(): array
    {
        $order = $this->order(DirectBookingOrderStatus::PagoEmConfirmacao, 'reservation-cielo');
        $order->forceFill([
            'expires_at' => now()->addMinutes(20),
            'reservation_status' => 'booked',
            'payment_status' => 'approved',
        ])->save();
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'cielo-confirmation-'.$order->id,
            'request_fingerprint' => str_repeat('c', 64),
            'gateway_payment_id' => 'cielo-payment-'.$order->id,
            'gateway_provider' => 'cielo_checkout',
            'gateway_idempotency_key' => 'cielo-order-'.$order->id,
            'payment_method' => 'card',
            'payment_method_id' => 'cielo_checkout',
            'installments' => 1,
            'status' => 'approved',
            'gateway_status' => 'approved',
            'amount' => '3001.00',
            'currency' => 'BRL',
            'paid_at' => now(),
        ]);
        $reservation = [
            '_id' => 'reservation-cielo',
            '_idlisting' => 'JQ08G',
            '_idclient' => 'client-3',
            'type' => 'booked',
            'checkInDate' => '2026-11-10',
            'checkOutDate' => '2026-11-13',
            'guests' => 2,
            'price' => ['currency' => 'BRL', '_f_expected' => 3001],
            'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
        ];

        return [$order, $reservation, $attempt];
    }

    /** @param array<string, mixed> $requestData
     * @return array<string, mixed>
     */
    private function reservationFrom(array $requestData, string $id): array
    {
        return ['_id' => $id, '_idlisting' => $requestData['listingId'] ?? 'JQ08G', '_idclient' => $requestData['_idclient'] ?? 'client-1', 'type' => $requestData['type'] ?? 'reserved', 'checkInDate' => $requestData['checkInDate'] ?? '2026-11-10', 'checkOutDate' => $requestData['checkOutDate'] ?? '2026-11-13', 'guests' => $requestData['guests'] ?? 2, 'guestsDetails' => $requestData['guestsDetails'] ?? ['adults' => 2, 'children' => 0, 'infants' => 0], 'price' => $requestData['price'] ?? ['currency' => 'BRL', '_f_expected' => 3001], 'internalNote' => $requestData['internalNote'] ?? ''];
    }
}
