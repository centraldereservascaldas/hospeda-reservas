<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Jobs\ReconcileMercadoPagoPayment;
use App\Jobs\SendDirectBookingConfirmationEmail;
use App\Mail\DirectBookingConfirmed;
use App\Models\DirectBookingEmail;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\DirectSaleTermsRegistry;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\TestCase;

class DirectCheckoutIntegratedJourneyTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_pix_webhook_confirmation_email_and_resume_complete_the_real_order_journey(): void
    {
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        Http::preventStrayRequests();

        $reservation = null;
        $staysPayments = [];
        $gatewayStatus = 'pending';
        Http::fake(function (ClientRequest $request) use (&$reservation, &$staysPayments, &$gatewayStatus) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if ($path === '/external/v1/booking/search-listings' && $method === 'POST') {
                return Http::response([['id' => 'JQ08G']], 200);
            }
            if ($path === '/external/v1/booking/calculate-price' && $method === 'POST') {
                return Http::response([[
                    '_idlisting' => 'JQ08G',
                    'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true, 'fees' => []],
                ]], 200);
            }
            if ($path === '/external/v1/booking/clients' && $method === 'GET') {
                return Http::response([], 200);
            }
            if ($path === '/external/v1/booking/clients' && $method === 'POST') {
                return Http::response(['_id' => 'client-journey-1'], 201);
            }
            if ($path === '/external/v1/booking/reservations' && $method === 'POST') {
                $payload = $request->data();
                $reservation = [
                    '_id' => 'reservation-journey-1',
                    '_idlisting' => $payload['listingId'],
                    '_idclient' => $payload['_idclient'],
                    'type' => 'reserved',
                    'checkInDate' => $payload['checkInDate'],
                    'checkOutDate' => $payload['checkOutDate'],
                    'guests' => $payload['guests'],
                    'guestsDetails' => $payload['guestsDetails'],
                    'price' => $payload['price'],
                    'internalNote' => $payload['internalNote'],
                ];

                return Http::response($reservation, 201);
            }
            if ($path === '/external/v1/booking/reservations/reservation-journey-1' && $method === 'GET') {
                return Http::response($reservation, 200);
            }
            if ($path === '/external/v1/booking/reservations/reservation-journey-1/payments' && $method === 'GET') {
                return Http::response($staysPayments, 200);
            }
            if ($path === '/external/v1/booking/reservations/reservation-journey-1/payments' && $method === 'POST') {
                $payment = [...$request->data(), '_id' => 'stays-payment-journey-1'];
                $staysPayments[] = $payment;

                return Http::response($payment, 201);
            }
            if ($path === '/external/v1/booking/reservations/reservation-journey-1' && $method === 'PATCH') {
                $reservation['type'] = $request->data()['type'];

                return Http::response($reservation, 200);
            }
            if ($path === '/v1/payments' && $method === 'POST') {
                return Http::response(['id' => '987654321'], 201);
            }
            if ($path === '/v1/payments/987654321' && $method === 'GET') {
                return Http::response($this->gatewayPayment($reservation, $gatewayStatus), 200);
            }

            throw new RuntimeException('Unexpected HTTP fake request: '.$method.' '.$request->url());
        });

        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'integrated-checkout-journey-001',
        ])
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('code', 'pre_reserved')
            ->assertJsonPath('order.status', 'pre_reservado')
            ->assertJsonPath('order.reservationConfirmed', false);

        $reference = $checkout->json('resume.reference');
        $resumeToken = $checkout->json('resume.token');
        $order = DirectBookingOrder::query()->where('public_reference', $reference)->sole();
        $this->assertSame('reserved', $order->reservation_status);
        $this->assertSame('reservation-journey-1', $order->stays_reservation_id);

        $payment = $this->postJson('/api/checkout/'.$reference.'/payments', [
            'paymentMethod' => 'pix',
            'paymentMethodId' => 'pix',
        ], [
            'Idempotency-Key' => 'integrated-payment-journey-001',
            'X-Checkout-Resume-Token' => $resumeToken,
        ])
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('payment.status', 'pending');

        $attempt = DirectBookingPaymentAttempt::query()->where('direct_booking_order_id', $order->id)->sole();
        $this->assertSame('pending', $attempt->status);
        $this->assertSame('987654321', $attempt->gateway_payment_id);
        $this->assertSame(DirectBookingOrderStatus::PagamentoPendente, $order->refresh()->status);

        $gatewayStatus = 'approved';
        $requestId = 'integrated-checkout-webhook-001';
        $timestamp = '1704908010';
        $signature = hash_hmac('sha256', 'id:987654321;request-id:'.$requestId.';ts:'.$timestamp.';', 'test-webhook-secret');
        $this->postJson('/api/webhooks/mercadopago?type=payment&data.id=987654321', [
            'action' => 'payment.updated',
            'type' => 'payment',
        ], [
            'x-request-id' => $requestId,
            'x-signature' => 'ts='.$timestamp.',v1='.$signature,
        ])->assertAccepted()->assertJsonPath('received', true);

        $webhook = DirectBookingPaymentWebhook::query()->where('gateway_payment_id', '987654321')->sole();
        (new ReconcileMercadoPagoPayment($webhook->id))->handle(app(DirectCheckoutPaymentService::class));

        $webhook->refresh();
        $attempt->refresh();
        $order->refresh();
        $this->assertSame('processed', $webhook->status);
        $this->assertSame('approved', $attempt->status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $order->status);

        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $order->refresh();
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
        $this->assertSame('booked', $order->reservation_status);
        $this->assertSame('succeeded', $order->staysActions()->where('action_type', 'register_payment')->sole()->status);
        $this->assertSame('succeeded', $order->staysActions()->where('action_type', 'confirm_reservation')->sole()->status);
        $this->assertCount(1, $staysPayments);
        $this->assertSame(3001.0, $staysPayments[0]['_f_val']);
        $this->assertSame('completed', $staysPayments[0]['status']);

        $email = DirectBookingEmail::query()->where('direct_booking_order_id', $order->id)->sole();
        $this->assertSame(DirectBookingEmail::TYPE_BOOKING_CONFIRMED, $email->notification_type);
        $this->assertSame('queued', $email->status);

        Mail::fake();
        (new SendDirectBookingConfirmationEmail($email->id))->handle();
        Mail::assertSent(DirectBookingConfirmed::class, 1);
        $this->assertSame('sent', $email->refresh()->status);

        $this->getJson('/api/checkout/'.$reference, ['X-Checkout-Resume-Token' => $resumeToken])
            ->assertOk()
            ->assertJsonPath('order.status', 'confirmado')
            ->assertJsonPath('order.reservationConfirmed', true)
            ->assertJsonPath('confirmation.reservationCode', 'reservation-journey-1')
            ->assertJsonPath('payment.attempt.status', 'approved');

        $this->assertCount(1, Http::recorded(fn (ClientRequest $request): bool => $request->url() === 'https://stays.test/external/v1/booking/reservations'
            && $request->method() === 'POST'));
        $this->assertCount(1, Http::recorded(fn (ClientRequest $request): bool => $request->url() === 'https://api.mercadopago.com/v1/payments'
            && $request->method() === 'POST'));
        $this->assertCount(1, Http::recorded(fn (ClientRequest $request): bool => $request->url() === 'https://stays.test/external/v1/booking/reservations/reservation-journey-1'
            && $request->method() === 'PATCH'));
        $this->assertSame(1, DirectBookingPaymentWebhook::query()->count());
    }

    private function configureCheckout(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.live_payments_enabled' => false,
            'direct-booking.pilot_listing_ids' => ['JQ08G', 'synthetic-pilot-2'],
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
            'direct-booking.reservation_hold_minutes' => 60,
            'direct-booking.resume_token_ttl_days' => 30,
            'direct-booking.webhook_queue_connection' => 'database',
            'direct-booking.notification_queue_connection' => 'database',
            'services.stays.client_id' => 'test-client',
            'services.stays.client_secret' => 'test-secret',
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.mercadopago.access_token' => 'test-access-token',
            'services.mercadopago.webhook_secret' => 'test-webhook-secret',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
            'cache.default' => 'array',
        ]);
    }

    private function bindSyntheticApprovedCatalog(): void
    {
        $catalog = [
            $this->syntheticPilot('JQ08G', 'JQ08G'),
            $this->syntheticPilot('synthetic-pilot-2', 'synthetic-pilot-2'),
        ];

        $this->app->bind(DirectSaleTermsRegistry::class, static fn (): DirectSaleTermsRegistry => new class($catalog) extends DirectSaleTermsRegistry
        {
            /** @param list<array<string, mixed>> $catalog */
            public function __construct(private readonly array $catalog) {}

            protected function catalog(): array
            {
                return $this->catalog;
            }
        });
    }

    /** @return array<string, mixed> */
    private function syntheticPilot(string $id, string $staysListingId): array
    {
        return [
            'id' => $id,
            'staysListingId' => $staysListingId,
            'maxGuests' => 6,
            'directSaleTermsVersion' => 'terms-test-1',
            'directSaleTermsSnapshot' => [
                'version' => 'terms-test-1',
                'Preço e taxas' => 'Total validado na Stays no momento da compra.',
                'Cancelamento e reembolso' => 'Condições fictícias usadas apenas neste teste.',
                'Forma e prazo de pagamento' => 'Pix sujeito a confirmação do gateway.',
                'Prazo da pré-reserva' => 'A pré-reserva dura 60 minutos neste teste.',
                'Atendimento e suporte' => 'Atendimento fictício para a jornada automatizada.',
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function checkoutPayload(): array
    {
        return [
            'listingId' => 'JQ08G',
            'from' => '2026-11-10',
            'to' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0],
            'quoteTotal' => 3001,
            'guest' => ['fullName' => 'Checkout Guest', 'email' => 'checkout@example.test', 'phone' => '+5511999999999'],
            'acceptedTermsVersion' => 'terms-test-1',
            'acceptedTerms' => true,
        ];
    }

    /** @param array<string, mixed>|null $reservation
     * @return array<string, mixed>
     */
    private function gatewayPayment(?array $reservation, string $status): array
    {
        $order = DirectBookingOrder::query()->where('stays_reservation_id', $reservation['_id'] ?? null)->firstOrFail();

        return [
            'id' => '987654321',
            'status' => $status,
            'transaction_amount' => 3001,
            'currency_id' => 'BRL',
            'external_reference' => $order->id,
            'payment_method_id' => 'pix',
            'date_of_expiration' => now()->addMinutes(45)->toIso8601String(),
            'date_approved' => $status === 'approved' ? now()->toIso8601String() : null,
            'point_of_interaction' => ['transaction_data' => ['qr_code' => 'pix-copy-paste', 'qr_code_base64' => 'cXItY29kZQ==']],
        ];
    }
}
