<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysReservationService;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CieloCheckoutPaymentTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_order_keeps_its_provider_when_global_provider_changes(): void
    {
        $this->configureCielo();
        config(['direct-booking.payment_provider' => 'mercadopago']);
        $cieloOrder = $this->createPayableOrder();
        config(['direct-booking.payment_provider' => 'cielo_sandbox']);

        $payments = app(DirectCheckoutPaymentService::class);

        $this->assertSame('cielo_sandbox', $payments->provider());
        $this->assertSame('cielo_sandbox', $payments->provider($cieloOrder->refresh()));
        $this->assertSame('cielo_sandbox', $cieloOrder->refresh()->gateway_provider);
        $mercadoPagoOrder = $this->createPayableOrder('mercadopago', null);
        $this->assertSame('mercadopago', $payments->provider($mercadoPagoOrder));
    }

    public function test_sandbox_order_cannot_be_charged_with_production_configuration(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $this->app->detectEnvironment(fn () => 'production');
        config([
            'services.cielo.direct_environment' => 'production',
            'services.cielo.production.enabled' => true,
            'services.cielo.production.sop_enabled' => true,
            'services.cielo.production.merchant_id' => 'cielo-merchant-sentinel',
            'services.cielo.production.merchant_key' => 'production-key-fixture',
            'services.cielo.production.sop_client_id' => 'production-client-fixture',
            'services.cielo.production.sop_client_secret' => 'production-secret-fixture',
            'direct-booking.live_payments_enabled' => true,
            'direct-booking.payment_provider' => 'cielo',
        ]);

        $this->assertSame([], app(DirectCheckoutPaymentService::class)->availableMethods($order));
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $this->cardPayload(), [
            'Idempotency-Key' => 'sandbox-production-boundary-001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertStatus(503)->assertJsonPath('code', 'payments_disabled');
        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
        Http::assertNothingSent();
    }

    public function test_authorized_status_remains_pending_and_captured_status_approves_only_matching_payment(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $capturedOrder = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->twice()->andReturn(true);
        $submissionCount = 0;
        Http::fake(function (ClientRequest $request) use (&$submissionCount): mixed {
            if ($request->url() !== 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/') {
                throw new \RuntimeException('Unexpected Cielo request in test fake.');
            }
            $submissionCount++;

            return Http::response($this->cieloPayment(
                $submissionCount === 1
                    ? '123e4567-e89b-12d3-a456-426614174001'
                    : '123e4567-e89b-12d3-a456-426614174002',
                $request->data()['MerchantOrderId'],
                $submissionCount === 1 ? 1 : 2,
            ), 201);
        });

        $authorized = $this->submitCardPayment($order, 'checkout-cielo-authorized-0001');
        $this->assertSame('pending', $authorized['payment']['status']);
        $this->assertSame(DirectBookingOrderStatus::PagamentoPendente, $order->refresh()->status);
        $this->assertNotSame('approved', $order->payment_status);

        $captured = $this->submitCardPayment($capturedOrder, 'checkout-cielo-captured-0002');

        $this->assertSame('approved', $captured['payment']['status']);
        $attempt = DirectBookingPaymentAttempt::query()->where('idempotency_key', 'checkout-cielo-captured-0002')->sole();
        $this->assertSame('captured', $attempt->gateway_status);
        $this->assertSame('approved', $attempt->status);
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $capturedOrder->refresh()->status);
        $this->assertSame('approved', $capturedOrder->payment_status);
        Http::assertSent(fn (ClientRequest $request): bool => $request->data()['Payment']['Amount'] === 133018
            && $request->data()['Payment']['Currency'] === 'BRL'
            && $request->data()['Payment']['Type'] === 'CreditCard'
            && $request->data()['Payment']['Installments'] === 1
            && $request->data()['Payment']['Interest'] === 'ByMerchant'
            && isset($request->data()['Payment']['CreditCard']['PaymentToken'])
        );
    }

    public function test_card_payment_accepts_six_installments_without_changing_the_order_total(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        Http::fake(['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => function (ClientRequest $request) {
            return Http::response($this->cieloPayment(
                '123e4567-e89b-12d3-a456-426614174060',
                $request['MerchantOrderId'],
                2,
                $request['Payment']['Amount'],
            ), 201);
        }]);

        $payload = [...$this->cardPayload(), 'installments' => 6];
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $payload, [
            'Idempotency-Key' => 'checkout-cielo-six-installments-0001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertCreated()->assertJsonPath('payment.amount', '1525.00');

        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame(6, $attempt->installments);
        $this->assertSame('1250.50', $attempt->base_amount);
        $this->assertSame('274.50', $attempt->processing_fee_amount);
        $this->assertSame(1800, $attempt->processing_fee_basis_points);
        $this->assertSame('1525.00', $attempt->amount);
        Http::assertSent(fn (ClientRequest $request): bool => $request->data()['Payment']['Installments'] === 6
            && $request->data()['Payment']['Interest'] === 'ByMerchant'
            && $request->data()['Payment']['Amount'] === 152500);
    }

    public function test_card_payment_rejects_more_than_six_installments_before_contacting_cielo(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();

        $payload = [...$this->cardPayload(), 'installments' => 7];
        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $payload, [
            'Idempotency-Key' => 'checkout-cielo-too-many-installments-0001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertUnprocessable()->assertJsonValidationErrors('installments');

        $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
        Http::assertNothingSent();
    }

    public function test_pix_stays_pending_without_fee_and_only_authoritative_lookup_approves_it(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        config(['services.cielo.pix_enabled' => true, 'services.cielo.pix_qr_expiration_seconds' => 1800]);
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $paymentId = '123e4567-e89b-12d3-a456-426614174080';
        Http::fake(function (ClientRequest $request) use ($paymentId): mixed {
            if ($request->method() === 'POST') {
                return Http::response($this->cieloPixPayment(
                    $paymentId,
                    $request['MerchantOrderId'],
                    12,
                    true,
                ), 201);
            }

            return Http::response($this->cieloPixPayment(
                $paymentId,
                DirectBookingPaymentAttempt::query()->sole()->merchant_order_id,
                2,
                false,
            ));
        });

        $response = $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix',
            'paymentMethodId' => 'pix',
        ], [
            'Idempotency-Key' => 'checkout-cielo-pix-pending-0001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertCreated()
            ->assertJsonPath('payment.status', 'pending')
            ->assertJsonPath('payment.amount', '1250.50')
            ->assertJsonPath('payment.processingFeeAmount', '0.00');

        $this->assertNotEmpty($response->json('payment.pix.copyPaste'));
        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('pix', $attempt->payment_method);
        $this->assertSame(0, $attempt->processing_fee_basis_points);
        $this->assertSame(DirectBookingOrderStatus::PagamentoPendente, $order->refresh()->status);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && $request->data()['Payment']['Type'] === 'Pix'
            && $request->data()['Payment']['Amount'] === 125050
            && ! isset($request->data()['Payment']['Provider']));

        $result = app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($paymentId);
        $this->assertSame('approved', $result['attempt']?->status);
        $this->assertSame(DirectBookingOrderStatus::PagoEmConfirmacao, $order->refresh()->status);
        $this->assertNull($attempt->refresh()->pix_copy_paste);
        $this->assertNull($attempt->pix_qr_code_base64);
    }

    public function test_initial_pending_pix_without_safe_qr_instructions_fails_closed(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        config(['services.cielo.pix_enabled' => true]);
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        Http::fake(['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => function (ClientRequest $request) {
            return Http::response($this->cieloPixPayment(
                '123e4567-e89b-12d3-a456-426614174081',
                $request['MerchantOrderId'],
                12,
                false,
            ), 201);
        }]);

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', [
            'paymentMethod' => 'pix',
            'paymentMethodId' => 'pix',
        ], [
            'Idempotency-Key' => 'checkout-cielo-pix-invalid-qr-0001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertStatus(503)->assertJsonPath('code', 'gateway_payment_mismatch');

        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('attention_required', $attempt->status);
        $this->assertNull($attempt->pix_copy_paste);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->refresh()->status);
    }

    #[DataProvider('captureDateCases')]
    public function test_captured_payment_preserves_the_instant_when_cielo_omits_or_supplies_timezone(string $capturedDate): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        Http::fake(['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => function (ClientRequest $request) use ($capturedDate) {
            $payment = $this->cieloPayment('123e4567-e89b-12d3-a456-426614174010', $request['MerchantOrderId'], 2);
            $payment['Payment']['CapturedDate'] = $capturedDate;
            $payment['Payment']['ReceivedDate'] = $capturedDate;

            return Http::response($payment, 201);
        }]);

        $result = $this->submitCardPayment($order, 'checkout-cielo-capture-date-0001');

        $this->assertSame('approved', $result['payment']['status']);
        $this->assertSame('2026-10-28T19:51:09+00:00', $order->refresh()->paid_at->toIso8601String());
        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('2026-10-28T19:51:09+00:00', $attempt->paid_at->toIso8601String());
        $this->assertSame('2026-10-28T19:51:09+00:00', $attempt->gateway_updated_at->toIso8601String());
        Http::assertSentCount(1);
    }

    public static function captureDateCases(): array
    {
        return [
            'Cielo local timestamp without offset' => ['2026-10-28 16:51:09'],
            'explicit local offset' => ['2026-10-28T16:51:09-03:00'],
            'explicit UTC' => ['2026-10-28T19:51:09Z'],
        ];
    }

    #[DataProvider('mismatchPaymentCases')]
    public function test_gateway_identity_or_value_mismatch_never_approves_payment(string $field, mixed $value): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $gatewayPayment = $this->cieloPayment('123e4567-e89b-12d3-a456-426614174010', 'unused', 2);
        if (in_array($field, ['MerchantOrderId', 'PaymentId'], true)) {
            $gatewayPayment[$field] = $value;
        } elseif ($field === 'nestedPaymentId') {
            $gatewayPayment['Payment']['PaymentId'] = $value;
        } else {
            $gatewayPayment['Payment'][$field] = $value;
        }
        Http::fake(function (ClientRequest $request) use ($gatewayPayment): mixed {
            if ($request->url() !== 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/') {
                throw new \RuntimeException('Unexpected Cielo request in test fake.');
            }
            if ($gatewayPayment['MerchantOrderId'] === 'unused') {
                $gatewayPayment['MerchantOrderId'] = $request->data()['MerchantOrderId'];
            }

            return Http::response($gatewayPayment, 201);
        });

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $this->cardPayload(), [
            'Idempotency-Key' => 'checkout-cielo-mismatch-'.$field.'-0001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertStatus(503)->assertJsonPath('code', 'gateway_payment_mismatch');

        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $this->assertSame('attention_required', $attempt->status);
        $this->assertNotSame('approved', $order->refresh()->payment_status);
        $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->status);
        $this->assertSame(0, $order->staysActions()->where('action_type', 'confirm_reservation')->count());
    }

    public static function mismatchPaymentCases(): array
    {
        return [
            'amount' => ['Amount', 125049],
            'currency' => ['Currency', 'USD'],
            'merchant order' => ['MerchantOrderId', 'wrongorder'],
            'payment type' => ['Type', 'DebitCard'],
            'payment id' => ['PaymentId', 'not-a-uuid'],
            'conflicting nested payment id' => ['nestedPaymentId', '123e4567-e89b-12d3-a456-426614174099'],
        ];
    }

    public function test_timeout_marks_submission_unknown_and_reconciliation_queries_without_replaying_post(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $this->mock(DirectStaysReservationService::class)
            ->shouldReceive('validateReservedOrderForPayment')->once()->andReturn(true);
        $attempt = null;
        Http::fake(function (ClientRequest $request) use (&$attempt): mixed {
            if ($request->url() === 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/') {
                return Http::failedConnection();
            }
            if (str_starts_with($request->url(), 'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales?merchantOrderId=')) {
                return Http::response([['PaymentId' => '123e4567-e89b-12d3-a456-426614174020']]);
            }

            if ($request->url() !== 'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174020') {
                throw new \RuntimeException('Unexpected Cielo request in test fake.');
            }

            return Http::response($this->cieloPayment(
                '123e4567-e89b-12d3-a456-426614174020',
                $attempt?->merchant_order_id,
                2,
            ));
        });

        $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $this->cardPayload(), [
            'Idempotency-Key' => 'checkout-cielo-timeout-recovery-0001',
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertStatus(503)->assertJsonPath('code', 'gateway_result_unknown');

        $attempt = DirectBookingPaymentAttempt::query()->sole();
        $merchantOrderId = $attempt->merchant_order_id;
        $lookupPayment = $this->cieloPayment('123e4567-e89b-12d3-a456-426614174020', $merchantOrderId, 2);
        $result = app(DirectCheckoutPaymentService::class)->reconcileAttempt($attempt->refresh());

        $this->assertSame('approved', $result['attempt']?->status);
        $this->assertSame(1, collect(Http::recorded())->filter(fn (array $pair): bool => $pair[0]->method() === 'POST'
            && $pair[0]->url() === 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/')->count());
        $this->assertSame($lookupPayment['MerchantOrderId'], $attempt->refresh()->merchant_order_id);
        $attempt->refresh();
        $this->assertSame('approved', $attempt->status);
        $this->assertSame('123e4567-e89b-12d3-a456-426614174020', $attempt->gateway_payment_id);
    }

    public function test_changed_merchant_identity_blocks_reconciliation_before_query(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder();
        $attempt = $this->createAttempt($order, 'different-merchant-sentinel');
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);

        $result = app(DirectCheckoutPaymentService::class)->reconcileAttempt($attempt);

        $this->assertSame('gateway_merchant_identity_changed', $result['code']);
        $this->assertSame('attention_required', $attempt->refresh()->status);
        Http::assertNothingSent();
    }

    public function test_cielo_lookup_does_not_claim_a_mercado_pago_attempt_with_same_merchant_order_id(): void
    {
        Http::preventStrayRequests();
        $this->configureCielo();
        $order = $this->createPayableOrder('mercadopago', null);
        $attempt = $this->createAttempt($order, null, 'sharedmerchantorder1', 'mercadopago');
        Http::fake([
            'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174030' => Http::response(
                $this->cieloPayment('123e4567-e89b-12d3-a456-426614174030', 'sharedmerchantorder1', 2),
            ),
        ]);

        try {
            app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId('123e4567-e89b-12d3-a456-426614174030');
            $this->fail('Cielo lookup must not claim an attempt owned by Mercado Pago.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Cielo payment does not match a persisted attempt and merchant identity.', $exception->getMessage());
        }

        $this->assertSame('pending', $attempt->refresh()->status);
        $this->assertNull($attempt->gateway_payment_id);
    }

    private function configureCielo(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('a', 32)),
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.resume_token_ttl_days' => 2,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'stays-provider-sentinel',
            'direct-booking.notification_queue_connection' => 'database',
            'services.stays.client_id' => 'stays-client-sentinel',
            'services.stays.client_secret' => 'stays-secret-sentinel',
            'services.cielo.enabled' => true,
            'services.cielo.sop_enabled' => true,
            'services.cielo.merchant_id' => 'cielo-merchant-sentinel',
            'services.cielo.merchant_key' => 'cielo-key-sentinel',
            'services.cielo.sop_client_id' => 'cielo-sop-id-sentinel',
            'services.cielo.sop_client_secret' => 'cielo-sop-secret-sentinel',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
        ]);
    }

    private function createPayableOrder(string $provider = 'cielo_sandbox', ?string $merchantId = 'cielo-merchant-sentinel'): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado,
            'idempotency_key' => fake()->uuid(),
            'public_reference' => bin2hex(random_bytes(20)),
            'resume_token' => 'synthetic-resume-token',
            'resume_token_expires_at' => now()->addDay(),
            'request_fingerprint' => str_repeat('d', 64),
            'listing_id' => 'synthetic-listing',
            'stays_listing_id' => 'synthetic-stays-listing',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2],
            'guest_name' => 'Synthetic Guest',
            'guest_email' => 'guest@example.test',
            'guest_phone' => '+5511999999999',
            'quote_total' => '1250.50',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'synthetic-terms-v1',
            'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(),
            'origin' => 'website',
            'reservation_status' => 'reserved',
            'stays_reservation_id' => 'synthetic-reservation-'.Str::uuid(),
            'expires_at' => now()->addHour(),
            'operational_events' => [],
            'gateway_provider' => $provider,
            'gateway_merchant_id' => $merchantId,
        ]);
    }

    private function createAttempt(DirectBookingOrder $order, ?string $merchantId, string $merchantOrderId = 'sharedmerchantorder1', string $provider = 'cielo_sandbox'): DirectBookingPaymentAttempt
    {
        return DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => fake()->uuid(),
            'request_fingerprint' => str_repeat('e', 64),
            'gateway_provider' => $provider,
            'gateway_merchant_id' => $merchantId,
            'merchant_order_id' => $merchantOrderId,
            'payment_method' => 'card',
            'payment_method_id' => 'cielo_credit_card',
            'status' => 'pending',
            'gateway_status' => 'authorized',
            'amount' => '1250.50',
            'currency' => 'BRL',
            'expires_at' => $order->expires_at,
        ]);
    }

    private function submitCardPayment(DirectBookingOrder $order, string $idempotencyKey): array
    {
        $response = $this->postJson('/api/checkout/'.$order->public_reference.'/payments', $this->cardPayload(), [
            'Idempotency-Key' => $idempotencyKey,
            'X-Checkout-Resume-Token' => 'synthetic-resume-token',
        ])->assertCreated();

        return $response->json();
    }

    private function cardPayload(): array
    {
        return [
            'paymentMethod' => 'card',
            'paymentMethodId' => 'cielo_credit_card',
            'token' => '123e4567-e89b-12d3-a456-426614174000',
            'installments' => 1,
            'cardholderName' => 'Synthetic Guest',
            'cardholderEmail' => 'guest@example.test',
            'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901'],
        ];
    }

    private function cieloPayment(string $paymentId, ?string $merchantOrderId, int $status, int $amountCents = 133018): array
    {
        return [
            'PaymentId' => $paymentId,
            'MerchantOrderId' => $merchantOrderId,
            'Payment' => [
                'Type' => 'CreditCard',
                'Status' => $status,
                'Amount' => $amountCents,
                'Currency' => 'BRL',
                'CapturedDate' => $status === 2 ? now()->toIso8601String() : null,
            ],
        ];
    }

    private function cieloPixPayment(string $paymentId, ?string $merchantOrderId, int $status, bool $withQr): array
    {
        return [
            'MerchantOrderId' => $merchantOrderId,
            'Payment' => [
                'PaymentId' => $paymentId,
                'Type' => 'Pix',
                'Status' => $status,
                'Amount' => 125050,
                'Currency' => 'BRL',
                'CapturedDate' => $status === 2 ? now()->toIso8601String() : null,
                'ExpirationDate' => now()->addMinutes(30)->toIso8601String(),
                ...($withQr ? [
                    'QrCodeString' => '00020101021226890014br.gov.bcb.pix2563pix-sandbox.example.test/fixture6304ABCD',
                    'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic-png-fixture"),
                ] : []),
            ],
        ];
    }
}
