<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Jobs\ReconcileCieloPaymentWebhook;
use App\Jobs\ReconcileMercadoPagoPayment;
use App\Jobs\SendDirectBookingConfirmationEmail;
use App\Mail\DirectBookingConfirmed;
use App\Models\DirectBookingEmail;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\DirectSaleTermsRegistry;
use App\Services\DirectStaysPaymentService;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
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

        $gatewayStatus = 'pending';
        $this->fakeJourneyHttp($gatewayStatus);

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
        $staysPayment = Http::recorded(fn (ClientRequest $request): bool => parse_url($request->url(), PHP_URL_PATH) === '/external/v1/booking/reservations/reservation-journey-1/payments'
            && $request->method() === 'POST')->sole()[0];
        $this->assertSame(3001.0, $staysPayment->data()['_f_val']);
        $this->assertSame('completed', $staysPayment->data()['status']);

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
            'direct-booking.payment_provider' => 'mercadopago',
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.send_confirmation_email' => true,
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
            'services.mercadopago.public_key' => 'test-public-key',
            'services.mercadopago.webhook_secret' => 'test-webhook-secret',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
            'cache.default' => 'array',
        ]);
    }

    #[DataProvider('cieloInstallmentOptions')]
    public function test_cielo_sandbox_checkout_confirms_stays_once_after_captured_payment(int $installments): void
    {
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        $this->configureCieloSandbox();
        config(['direct-booking.stays_cielo_card_provider_ids.'.$installments => 'new-cielo-card-'.$installments.'x']);
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'approved';
        $this->fakeJourneyHttp($gatewayStatus, 'cielo_credit_card');

        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'cielo-integrated-checkout-001',
        ])->assertCreated()->assertJsonPath('order.status', 'pre_reservado');
        $reference = $checkout->json('resume.reference');
        $headers = [
            'Idempotency-Key' => 'cielo-integrated-payment-001',
            'X-Checkout-Resume-Token' => $checkout->json('resume.token'),
        ];
        $payload = [...$this->cardPayload(),
            'installments' => $installments,
            'paymentMethodId' => 'cielo_credit_card',
            'token' => getenv('CIELO_TEST_APPROVED_TOKEN') ?: '123e4567-e89b-12d3-a456-426614174000',
        ];

        $response = $this->postJson('/api/checkout/'.$reference.'/payments', $payload, $headers);
        $this->assertSame(201, $response->status(), (string) $response->json('code'));
        $response->assertJsonPath('payment.status', 'approved');
        $this->postJson('/api/checkout/'.$reference.'/payments', $payload, $headers)
            ->assertOk()->assertJsonPath('replayed', true);
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $order = DirectBookingOrder::query()->sole();
        $this->assertSame('cielo_sandbox', $order->gateway_provider);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame('booked', $order->reservation_status);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
        $this->assertSame(1, DirectBookingPaymentAttempt::query()->count());
        $this->assertSame(1, $this->recordedRequests('/1/sales/', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/reservation-journey-1/payments')
            && $request['_idpaymentProvider'] === 'new-cielo-card-'.$installments.'x'
            && $request['name'] === 'Cartão API Cielo '.$installments.'x');
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));

        $email = DirectBookingEmail::query()->sole();
        (new SendDirectBookingConfirmationEmail($email->id))->handle();
        Mail::assertSent(DirectBookingConfirmed::class, 1);
        $this->getJson('/api/checkout/'.$reference, $headers)->assertOk()
            ->assertJsonPath('order.reservationConfirmed', true)
            ->assertJsonPath('payment.attempt.status', 'approved');
    }

    public static function cieloInstallmentOptions(): array
    {
        return [[1], [2], [3], [4], [5], [6]];
    }

    public function test_cielo_card_fraud_review_waits_and_accepted_capture_confirms_stays_only_once(): void
    {
        $this->freezeTime();
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        $this->configureCieloSandbox();
        config([
            'services.cielo.webhook_header_name' => 'X-Cielo-Secret',
            'services.cielo.webhook_header_value' => 'synthetic-card-review-secret',
            'services.cielo.webhook_queue_connection' => 'database',
        ]);
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'approved';
        $fraudAnalysis = ['Status' => 999, 'StatusDescription' => 'Review'];
        $this->fakeJourneyHttp($gatewayStatus, 'cielo_credit_card', $fraudAnalysis);
        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), ['Idempotency-Key' => 'cielo-card-review-checkout-001'])->assertCreated();
        $reference = $checkout->json('resume.reference');
        $headers = ['X-Checkout-Resume-Token' => $checkout->json('resume.token'), 'Idempotency-Key' => 'cielo-card-review-payment-001'];
        $this->postJson('/api/checkout/'.$reference.'/payments', [...$this->cardPayload(), 'paymentMethodId' => 'cielo_credit_card', 'token' => '123e4567-e89b-12d3-a456-426614174000'], $headers)
            ->assertOk()->assertJsonPath('payment.status', 'attention_required');
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $order = DirectBookingOrder::query()->sole();
        $this->assertSame('attention_required', $order->payment_status);
        $this->assertSame('reserved', $order->reservation_status);
        $this->assertSame(0, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        $this->assertSame(0, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
        Mail::assertNothingOutgoing();

        $fraudAnalysis = ['Status' => 1, 'StatusDescription' => 'Accept'];
        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $notification = ['PaymentId' => $attempt->gateway_payment_id, 'ChangeType' => 3];
        $notificationHeaders = ['X-Cielo-Secret' => 'synthetic-card-review-secret'];
        $this->postJson('/api/webhooks/cielo', $notification, $notificationHeaders)->assertOk();
        $this->postJson('/api/webhooks/cielo', $notification, $notificationHeaders)->assertOk()->assertJsonPath('duplicate', true);
        $webhook = DirectBookingPaymentWebhook::query()->sole();
        (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class), app(DirectStaysPaymentService::class));
        (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class), app(DirectStaysPaymentService::class));
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->refresh()->status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame('booked', $order->reservation_status);
        $this->assertSame('processed', $webhook->refresh()->status);
        $this->assertSame(1, $this->recordedRequests('/1/sales/', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
    }

    public function test_cielo_sandbox_decline_keeps_the_stays_reservation_unconfirmed(): void
    {
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        $this->configureCieloSandbox();
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'rejected';
        $this->fakeJourneyHttp($gatewayStatus, 'cielo_credit_card');
        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'cielo-declined-checkout-001',
        ])->assertCreated();

        $this->postJson('/api/checkout/'.$checkout->json('resume.reference').'/payments', [
            ...$this->cardPayload(),
            'paymentMethodId' => 'cielo_credit_card',
            'token' => getenv('CIELO_TEST_DECLINED_TOKEN') ?: '123e4567-e89b-12d3-a456-426614174000',
        ], [
            'Idempotency-Key' => 'cielo-declined-payment-001',
            'X-Checkout-Resume-Token' => $checkout->json('resume.token'),
        ])->assertCreated()->assertJsonPath('payment.status', 'rejected');

        $order = DirectBookingOrder::query()->sole();
        $this->assertSame(DirectBookingOrderStatus::PagamentoRecusado, $order->status);
        $this->assertSame('reserved', $order->reservation_status);
        $this->assertSame(0, DirectBookingEmail::query()->count());
        $this->assertSame(0, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        $this->assertSame(0, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
        Mail::assertNothingOutgoing();
    }

    public function test_cielo_pix_webhook_confirms_stays_and_email_once_without_card_fees(): void
    {
        $this->freezeTime();
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        $this->configureCieloSandbox();
        config([
            'direct-booking.rollout_mode' => 'all_approved',
            'direct-booking.pilot_listing_ids' => [],
            'services.cielo.pix_enabled' => true,
            'services.cielo.pix_qr_expiration_seconds' => 1800,
            'services.cielo.webhook_header_name' => 'X-Cielo-Secret',
            'services.cielo.webhook_header_value' => 'synthetic-cielo-pix-secret',
            'services.cielo.webhook_queue_connection' => 'database',
        ]);
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'pending';
        $this->fakeJourneyHttp($gatewayStatus, 'cielo_pix');

        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'cielo-pix-checkout-journey-001',
        ])->assertCreated()->assertJsonPath('order.status', 'pre_reservado');
        $reference = $checkout->json('resume.reference');
        $headers = [
            'Idempotency-Key' => 'cielo-pix-payment-journey-001',
            'X-Checkout-Resume-Token' => $checkout->json('resume.token'),
        ];
        $payload = ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'];
        $this->postJson('/api/checkout/'.$reference.'/payments', $payload, $headers)
            ->assertCreated()->assertJsonPath('payment.status', 'pending')
            ->assertJsonPath('payment.amount', '3001.00')
            ->assertJsonPath('payment.processingFeeAmount', '0.00');
        $this->postJson('/api/checkout/'.$reference.'/payments', $payload, $headers)
            ->assertOk()->assertJsonPath('replayed', true);
        $this->assertSame('reserved', DirectBookingOrder::query()->sole()->reservation_status);
        $this->assertDatabaseCount('direct_booking_emails', 0);

        $gatewayStatus = 'approved';
        $notification = ['PaymentId' => '123e4567-e89b-12d3-a456-426614174001', 'ChangeType' => 1];
        $webhookHeaders = ['X-Cielo-Secret' => 'synthetic-cielo-pix-secret'];
        $this->postJson('/api/webhooks/cielo', $notification, $webhookHeaders)->assertOk();
        $this->postJson('/api/webhooks/cielo', $notification, $webhookHeaders)
            ->assertOk()->assertJsonPath('duplicate', true);
        $webhook = DirectBookingPaymentWebhook::query()->sole();
        (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class), app(DirectStaysPaymentService::class));
        $this->assertSame(DirectBookingOrderStatus::Confirmado, DirectBookingOrder::query()->sole()->status);
        (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class), app(DirectStaysPaymentService::class));
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $order = DirectBookingOrder::query()->sole();
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
        $this->assertSame('booked', $order->reservation_status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame('processed', $webhook->refresh()->status);
        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('pix', $attempt->payment_method);
        $this->assertSame('0.00', $attempt->processing_fee_amount);
        $this->assertSame(1, $this->recordedRequests('/1/sales/', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
        $email = DirectBookingEmail::query()->sole();
        (new SendDirectBookingConfirmationEmail($email->id))->handle();
        Mail::assertSent(DirectBookingConfirmed::class, 1);
        $this->getJson('/api/checkout/'.$reference, $headers)->assertOk()
            ->assertJsonPath('order.reservationConfirmed', true)
            ->assertJsonPath('payment.attempt.status', 'approved');
    }

    public function test_cielo_pix_polling_confirms_stays_without_partner_webhook_or_own_email(): void
    {
        $this->freezeTime();
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        $this->configureCieloSandbox();
        config(['direct-booking.stays_cielo_pix_provider_id' => 'new-cielo-pix']);
        config([
            'direct-booking.send_confirmation_email' => false,
            'services.cielo.pix_enabled' => true,
            'services.cielo.pix_qr_expiration_seconds' => 1800,
            'services.cielo.webhook_header_name' => null,
            'services.cielo.webhook_header_value' => null,
            'mail.default' => 'log',
        ]);
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'pending';
        $this->fakeJourneyHttp($gatewayStatus, 'cielo_pix');

        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'cielo-polling-checkout-journey-001',
        ])->assertCreated();
        $reference = $checkout->json('resume.reference');
        $headers = [
            'Idempotency-Key' => 'cielo-polling-payment-journey-001',
            'X-Checkout-Resume-Token' => $checkout->json('resume.token'),
        ];
        $this->postJson('/api/checkout/'.$reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix'], $headers)
            ->assertCreated()->assertJsonPath('payment.status', 'pending');

        $gatewayStatus = 'approved';
        $this->travel(6)->minutes();
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $order = DirectBookingOrder::query()->sole();
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
        $this->assertSame('booked', $order->reservation_status);
        $this->assertSame(1, $order->staysActions()->where('action_type', 'register_payment')->where('status', 'succeeded')->count());
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/reservation-journey-1/payments')
            && $request['_idpaymentProvider'] === 'new-cielo-pix'
            && $request['name'] === 'Pix API Cielo');
        $this->assertDatabaseCount('direct_booking_payment_webhooks', 0);
        $this->assertDatabaseCount('direct_booking_emails', 0);
        Mail::assertNothingOutgoing();
        $this->getJson('/api/checkout/'.$reference, $headers)->assertOk()
            ->assertJsonPath('order.reservationConfirmed', true);
    }

    private function configureCieloSandbox(): void
    {
        $liveSandbox = getenv('CIELO_LIVE_SANDBOX_TESTS') === '1';
        if ($liveSandbox) {
            foreach (['CIELO_TEST_MERCHANT_ID', 'CIELO_TEST_MERCHANT_KEY', 'CIELO_TEST_APPROVED_TOKEN', 'CIELO_TEST_DECLINED_TOKEN'] as $name) {
                $this->assertNotEmpty(getenv($name), 'Missing opt-in sandbox fixture: '.$name);
            }
            Http::allowStrayRequests(['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/']);
        }

        config([
            'direct-booking.payment_provider' => 'cielo_sandbox',
            'services.cielo.enabled' => true,
            'services.cielo.sop_enabled' => true,
            'services.cielo.merchant_id' => $liveSandbox ? getenv('CIELO_TEST_MERCHANT_ID') : 'sandbox-merchant-test',
            'services.cielo.merchant_key' => $liveSandbox ? getenv('CIELO_TEST_MERCHANT_KEY') : 'sandbox-key-test',
            'services.cielo.sop_client_id' => 'sandbox-sop-client-test',
            'services.cielo.sop_client_secret' => 'sandbox-sop-secret-test',
        ]);
    }

    public function test_prepared_production_contract_confirms_simulated_stays_without_real_external_requests(): void
    {
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        $this->app->detectEnvironment(fn () => 'production');
        config([
            'direct-booking.payment_provider' => 'cielo',
            'direct-booking.live_payments_enabled' => true,
            'services.cielo.direct_environment' => 'production',
            'services.cielo.production.enabled' => true,
            'services.cielo.production.sop_enabled' => true,
            'services.cielo.production.merchant_id' => 'production-merchant-fixture',
            'services.cielo.production.merchant_key' => 'production-key-fixture',
            'services.cielo.production.sop_client_id' => 'production-client-fixture',
            'services.cielo.production.sop_client_secret' => 'production-secret-fixture',
        ]);
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'approved';
        $this->fakeJourneyHttp($gatewayStatus, 'cielo_credit_card');
        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'production-contract-checkout-001',
        ])->assertCreated();
        $this->postJson('/api/checkout/'.$checkout->json('resume.reference').'/payments', [
            ...$this->cardPayload(), 'paymentMethodId' => 'cielo_credit_card', 'token' => '123e4567-e89b-12d3-a456-426614174000',
        ], [
            'Idempotency-Key' => 'production-contract-payment-001',
            'X-Checkout-Resume-Token' => $checkout->json('resume.token'),
        ])->assertCreated()->assertJsonPath('payment.status', 'approved');
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $order = DirectBookingOrder::query()->sole();
        $this->assertSame('cielo', $order->gateway_provider);
        $this->assertSame('production-merchant-fixture', $order->gateway_merchant_id);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
        $this->assertSame('cielo', DirectBookingPaymentAttempt::query()->sole()->gateway_provider);
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
        $this->assertSame(1, $this->recordedRequests('/1/sales/', 'POST'));
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

    public function test_approved_card_checkout_confirms_once_sends_email_and_can_be_resumed(): void
    {
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'approved';
        $this->fakeJourneyHttp($gatewayStatus, 'visa');

        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'integrated-card-approved-checkout-001',
        ])
            ->assertCreated()
            ->assertJsonPath('code', 'pre_reserved');

        $reference = $checkout->json('resume.reference');
        $resumeToken = $checkout->json('resume.token');
        $order = DirectBookingOrder::query()->where('public_reference', $reference)->sole();
        $this->assertSame(DirectBookingOrderStatus::PreReservado, $order->status);

        $this->postJson('/api/checkout/'.$reference.'/payments', $this->cardPayload(), [
            'Idempotency-Key' => 'integrated-card-approved-payment-001',
            'X-Checkout-Resume-Token' => $resumeToken,
        ])
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('payment.status', 'approved');

        $attempt = DirectBookingPaymentAttempt::query()->where('direct_booking_order_id', $order->id)->sole();
        $this->assertSame('approved', $attempt->status);
        $this->assertSame('987654321', $attempt->gateway_payment_id);
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $order->refresh()->status);

        $this->submitPaymentWebhook('987654321', 'integrated-card-approved-webhook-001');
        $webhook = DirectBookingPaymentWebhook::query()->where('gateway_payment_id', '987654321')->sole();
        (new ReconcileMercadoPagoPayment($webhook->id))->handle(app(DirectCheckoutPaymentService::class));

        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $order->refresh();
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
        $this->assertSame('approved', $order->payment_status);
        $this->assertSame('booked', $order->reservation_status);
        $this->assertSame(1, $order->staysActions()->where('action_type', 'register_payment')->where('status', 'succeeded')->count());
        $this->assertSame(1, $order->staysActions()->where('action_type', 'confirm_reservation')->where('status', 'succeeded')->count());
        $this->assertSame(1, DirectBookingEmail::query()->where('direct_booking_order_id', $order->id)->count());

        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();
        $email = DirectBookingEmail::query()->where('direct_booking_order_id', $order->id)->sole();
        (new SendDirectBookingConfirmationEmail($email->id))->handle();
        (new SendDirectBookingConfirmationEmail($email->id))->handle();
        Mail::assertSent(DirectBookingConfirmed::class, 1);
        $this->assertSame('sent', $email->refresh()->status);

        $this->getJson('/api/checkout/'.$reference, ['X-Checkout-Resume-Token' => $resumeToken])
            ->assertOk()
            ->assertJsonPath('order.status', 'confirmado')
            ->assertJsonPath('order.reservationConfirmed', true)
            ->assertJsonPath('confirmation.reservationCode', 'reservation-journey-1')
            ->assertJsonPath('payment.attempt.status', 'approved');

        $this->assertSame(1, DirectBookingOrder::query()->count());
        $this->assertSame(1, DirectBookingPaymentAttempt::query()->count());
        $this->assertSame(1, DirectBookingPaymentWebhook::query()->count());
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        $this->assertSame(1, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
        $this->assertSame(1, $this->recordedRequests('/v1/payments', 'POST'));
        $gatewayRequest = Http::recorded(fn (ClientRequest $request): bool => parse_url($request->url(), PHP_URL_PATH) === '/v1/payments'
            && $request->method() === 'POST')->sole()[0];
        $this->assertSame('visa', $gatewayRequest->data()['payment_method_id']);
        $this->assertSame('tokenized-card-credential', $gatewayRequest->data()['token']);
        $this->assertSame(1, $gatewayRequest->data()['installments']);
        $this->assertArrayNotHasKey('card_number', $gatewayRequest->data());
        $this->assertArrayNotHasKey('security_code', $gatewayRequest->data());
    }

    public function test_rejected_card_checkout_persists_decline_without_confirmation_or_financial_registration(): void
    {
        $this->configureCheckout();
        $this->bindSyntheticApprovedCatalog();
        Http::preventStrayRequests();
        Mail::fake();
        $gatewayStatus = 'rejected';
        $this->fakeJourneyHttp($gatewayStatus, 'visa');

        $checkout = $this->postJson('/api/checkout', $this->checkoutPayload(), [
            'Idempotency-Key' => 'integrated-card-rejected-checkout-001',
        ])->assertCreated();
        $reference = $checkout->json('resume.reference');
        $resumeToken = $checkout->json('resume.token');
        $order = DirectBookingOrder::query()->where('public_reference', $reference)->sole();

        $this->postJson('/api/checkout/'.$reference.'/payments', $this->cardPayload(), [
            'Idempotency-Key' => 'integrated-card-rejected-payment-001',
            'X-Checkout-Resume-Token' => $resumeToken,
        ])->assertCreated()->assertJsonPath('payment.status', 'rejected');

        $attempt = DirectBookingPaymentAttempt::query()->where('direct_booking_order_id', $order->id)->sole();
        $this->submitPaymentWebhook('987654321', 'integrated-card-rejected-webhook-001');
        $webhook = DirectBookingPaymentWebhook::query()->where('gateway_payment_id', '987654321')->sole();
        (new ReconcileMercadoPagoPayment($webhook->id))->handle(app(DirectCheckoutPaymentService::class));

        $order->refresh();
        $attempt->refresh();
        $this->assertSame(DirectBookingOrderStatus::PagamentoRecusado, $order->status);
        $this->assertSame('rejected', $order->payment_status);
        $this->assertSame('reserved', $order->reservation_status);
        $this->assertSame('rejected', $attempt->status);
        $this->assertSame('processed', $webhook->refresh()->status);
        $this->assertSame(0, $order->staysActions()->where('action_type', 'register_payment')->count());
        $this->assertSame(0, $order->staysActions()->where('action_type', 'confirm_reservation')->count());
        $this->assertSame(0, DirectBookingEmail::query()->where('direct_booking_order_id', $order->id)->count());
        Mail::assertNothingOutgoing();

        $this->getJson('/api/checkout/'.$reference, ['X-Checkout-Resume-Token' => $resumeToken])
            ->assertOk()
            ->assertJsonPath('order.status', 'pagamento_recusado')
            ->assertJsonPath('order.reservationConfirmed', false)
            ->assertJsonPath('payment.attempt.status', 'rejected');

        $this->assertSame(1, DirectBookingOrder::query()->count());
        $this->assertSame(1, DirectBookingPaymentAttempt::query()->count());
        $this->assertSame(1, DirectBookingPaymentWebhook::query()->count());
        $this->assertSame(0, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1/payments', 'POST'));
        $this->assertSame(0, $this->recordedRequests('/external/v1/booking/reservations/reservation-journey-1', 'PATCH'));
    }

    /** @return array<string, mixed> */
    private function cardPayload(): array
    {
        return [
            'paymentMethod' => 'card',
            'paymentMethodId' => 'visa',
            'token' => 'tokenized-card-credential',
            'installments' => 1,
            'cardholderName' => 'Checkout Guest',
            'cardholderEmail' => 'checkout@example.test',
            'payerIdentification' => ['type' => 'CPF', 'number' => '12345678909'],
        ];
    }

    private function submitPaymentWebhook(string $paymentId, string $requestId): void
    {
        $timestamp = '1704908010';
        $signature = hash_hmac('sha256', 'id:'.$paymentId.';request-id:'.$requestId.';ts:'.$timestamp.';', 'test-webhook-secret');

        $this->postJson('/api/webhooks/mercadopago?type=payment&data.id='.$paymentId, [
            'action' => 'payment.updated',
            'type' => 'payment',
        ], [
            'x-request-id' => $requestId,
            'x-signature' => 'ts='.$timestamp.',v1='.$signature,
        ])->assertAccepted()->assertJsonPath('received', true);
    }

    private function fakeJourneyHttp(string &$gatewayStatus, string $paymentMethodId = 'pix', ?array &$fraudAnalysis = null): void
    {
        $reservation = null;
        $staysPayments = [];
        Http::fake(function (ClientRequest $request) use (&$reservation, &$staysPayments, &$gatewayStatus, $paymentMethodId, &$fraudAnalysis) {
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
                    '_id' => 'reservation-journey-1', '_idlisting' => $payload['listingId'],
                    '_idclient' => $payload['_idclient'], 'type' => 'reserved',
                    'checkInDate' => $payload['checkInDate'], 'checkOutDate' => $payload['checkOutDate'],
                    'guests' => $payload['guests'], 'guestsDetails' => $payload['guestsDetails'],
                    'price' => ['currency' => 'BRL', '_f_total' => 3001], 'internalNote' => $payload['internalNote'],
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
                return Http::response(['id' => '987654321', 'status' => 'pending'], 201);
            }
            if ($path === '/v1/payments/987654321' && $method === 'GET') {
                return Http::response($this->gatewayPayment($reservation, $gatewayStatus, $paymentMethodId), 200);
            }

            if (in_array($request->url(), ['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/', 'https://api.cieloecommerce.cielo.com.br/1/sales/'], true) && $method === 'POST') {
                if (getenv('CIELO_LIVE_SANDBOX_TESTS') === '1' && parse_url($request->url(), PHP_URL_HOST) === 'apisandbox.cieloecommerce.cielo.com.br') {
                    return null;
                }

                return Http::response([
                    'MerchantOrderId' => $request['MerchantOrderId'],
                    'Payment' => [
                        'PaymentId' => '123e4567-e89b-12d3-a456-426614174001',
                        'Type' => $paymentMethodId === 'cielo_pix' ? 'Pix' : 'CreditCard',
                        'Amount' => $request['Payment']['Amount'],
                        'Currency' => 'BRL',
                        'Status' => $gatewayStatus === 'approved' ? 2 : ($gatewayStatus === 'pending' ? 12 : 3),
                        ...(is_array($fraudAnalysis) ? ['FraudAnalysis' => $fraudAnalysis] : []),
                        ...($paymentMethodId === 'cielo_pix' ? [
                            'QrCodeString' => 'synthetic-pix-copy-paste',
                            'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic-qr"),
                        ] : []),
                    ],
                ], 201);
            }

            if ($request->url() === 'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174001' && $method === 'GET') {
                $attempt = DirectBookingPaymentAttempt::query()->sole();

                return Http::response([
                    'MerchantOrderId' => $attempt->merchant_order_id,
                    'Payment' => [
                        'PaymentId' => $attempt->gateway_payment_id,
                        'Type' => $attempt->payment_method === 'card' ? 'CreditCard' : 'Pix',
                        'Amount' => $attempt->payment_method === 'card' ? 319222 : 300100,
                        'Currency' => 'BRL',
                        'Status' => $gatewayStatus === 'approved' ? 2 : 12,
                        'CapturedDate' => now()->toIso8601String(),
                        ...(is_array($fraudAnalysis) ? ['FraudAnalysis' => $fraudAnalysis] : []),
                    ],
                ]);
            }

            throw new RuntimeException('Unexpected HTTP fake request: '.$method.' '.$request->url());
        });
    }

    private function recordedRequests(string $path, string $method): int
    {
        return Http::recorded(fn (ClientRequest $request): bool => parse_url($request->url(), PHP_URL_PATH) === $path
            && $request->method() === $method)->count();
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
    private function gatewayPayment(?array $reservation, string $status, string $paymentMethod = 'pix'): array
    {
        $order = DirectBookingOrder::query()->where('stays_reservation_id', $reservation['_id'] ?? null)->firstOrFail();

        return [
            'id' => '987654321',
            'status' => $status,
            'transaction_amount' => 3001,
            'currency_id' => 'BRL',
            'external_reference' => $order->id,
            'payment_method_id' => $paymentMethod,
            'date_of_expiration' => now()->addMinutes(45)->toIso8601String(),
            'date_approved' => $status === 'approved' ? now()->toIso8601String() : null,
            'point_of_interaction' => ['transaction_data' => ['qr_code' => 'pix-copy-paste', 'qr_code_base64' => 'cXItY29kZQ==']],
        ];
    }
}
