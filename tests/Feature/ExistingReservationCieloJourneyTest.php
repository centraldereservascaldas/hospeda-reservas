<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysPaymentService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentCycleRegistry;
use App\Services\LegalPageRegistry;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExistingReservationCieloJourneyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->useLegacyExistingReservationFixtures();
    }

    #[DataProvider('paymentMethods')]
    public function test_booking_payment_reuses_reservation_and_settles_its_receivable(string $method, string $scenario): void
    {
        if (in_array($scenario, ['deposit_flag_off_after', 'historical_invalid_document'], true)) {
            $this->withoutMiddleware(ThrottleRequests::class);
        }
        config([
            'direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true,
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.payment_provider' => 'cielo_sandbox',
            'direct-booking.notification_queue_connection' => 'database', 'direct-booking.resume_token_ttl_days' => 2,
            'direct-booking.stays_payment_type' => 'credit', 'direct-booking.stays_payment_provider_id' => 'test-provider',
            'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24),
            'direct-booking.stays_cielo_card_provider_ids' => array_combine(range(1, 6), array_map(fn ($n) => str_repeat((string) $n, 24), range(1, 6))),
            'services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'services.cielo.direct_environment' => 'sandbox', 'services.cielo.enabled' => true, 'services.cielo.sop_enabled' => true,
            'services.cielo.pix_enabled' => true, 'services.cielo.pix_qr_expiration_seconds' => 1800,
            'services.cielo.merchant_id' => 'test-merchant', 'services.cielo.merchant_key' => 'test-key',
            'services.cielo.sop_client_id' => 'test-sop-id', 'services.cielo.sop_client_secret' => 'test-sop-secret',
        ]);
        $reservationId = str_repeat('c', 24);
        $paymentId = str_repeat('a', 24);
        $gatewayId = '123e4567-e89b-12d3-a456-426614174080';
        $providerId = str_repeat('f', 24);
        $noReceivable = in_array($scenario, ['unrecorded', 'unrecorded_partial'], true);
        $staysPaymentId = $noReceivable ? str_repeat('b', 24) : $paymentId;
        $reservation = ['id' => 'ZY92K', 'partnerCode' => 'booking-partner-code', '_id' => $reservationId, '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']];
        if ($noReceivable) {
            $reservation['type'] = 'reserved';
        }
        $reservation['stats'] = ['_f_totalPaid' => 197.50];
        if (in_array($scenario, ['external_stats_after_qr', 'deposit_flag_off_before', 'deposit_flag_off_after'], true)) {
            $reservation['stats'] = ['_f_totalPaid' => 0];
        }
        $receivable = ['_idpaymentProvider' => $providerId, '_id' => $paymentId, 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $completed = false;
        $settlementAmount = 197.50;
        $settlementDesc = null;
        $balanceChanged = false;
        $delayedPendingResponse = false;
        $declineCard = $scenario === 'declined';
        $observeContradictoryCapture = false;
        $queryNotFound = false;
        $omitCapturedDate = $scenario === 'capture_time_missing';
        $forcedGatewayStatus = null;
        $forcedCapturedDate = null;
        Http::preventStrayRequests();
        $postedPayment = null;
        Http::fake(function (Request $request) use (&$completed, &$settlementAmount, &$settlementDesc, &$balanceChanged, &$delayedPendingResponse, &$declineCard, &$observeContradictoryCapture, &$queryNotFound, &$omitCapturedDate, &$forcedGatewayStatus, &$forcedCapturedDate, &$reservation, &$postedPayment, $receivable, $gatewayId, $method, $scenario, $providerId, $noReceivable, $staysPaymentId) {
            // RefreshDatabase wraps the test in one transaction; external calls
            // must not run inside the nested reservation-lock transaction.
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            if (str_contains($request->url(), 'stays.test')) {
                if (str_contains($request->url(), '/finance/payment-providers/')) {
                    return Http::response(['_id' => $providerId, 'status' => 'active', 'internalName' => 'Cielo Site Externo']);
                }
                if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                    return Http::response(['_id' => $staysPaymentId, 'reserveId' => $reservation['_id'], 'type' => 'credit', 'paid' => $completed,
                        'bankAccountId' => $providerId, '_mcval' => ['BRL' => $settlementAmount],
                        ...($completed ? ['payment' => ['paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString()]] : [])]);
                }
                if (str_contains($request->url(), '/content/listings/')) {
                    return Http::response(['_id' => $reservation['_idlisting'], '_mstitle' => ['pt_BR' => 'Apartamento de teste']]);
                }
                if ($request->method() === 'POST' && str_ends_with($request->url(), '/payments')) {
                    $completed = true;
                    $postedPayment = $request->data();
                    $settlementAmount = (float) $request['_f_val'];
                    $reservation['stats']['_f_totalPaid'] = match ($scenario) {
                        'unrecorded_partial' => 300,
                        default => 197.50 + $settlementAmount,
                    };

                    return Http::response(['_id' => $staysPaymentId, ...$postedPayment]);
                }
                if ($request->method() === 'PATCH' && str_contains($request->url(), '/payments/')) {
                    $completed = true;
                    $settlementDesc = $request['desc'];
                    $settlementAmount = (float) $request['_f_val'];
                    $reservation['stats']['_f_totalPaid'] = 197.50 + $settlementAmount;

                    return Http::response([]);
                }
                if ($request->method() === 'PATCH' && str_contains($request->url(), '/booking/reservations/')) {
                    $reservation['type'] = $request['type'];

                    return Http::response($reservation);
                }
                if (str_ends_with($request->url(), '/payments')) {
                    if ($noReceivable) {
                        return Http::response($postedPayment === null ? [] : [array_replace($postedPayment, ['_id' => $staysPaymentId, 'status' => 'completed', 'paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString()])]);
                    }

                    return Http::response([$completed ? array_replace($receivable, ['_f_val' => $settlementAmount, 'status' => 'completed', 'paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString(), '_idpaymentProvider' => $providerId, 'desc' => $settlementDesc]) : ($balanceChanged ? array_replace($receivable, ['_f_val' => 100]) : $receivable)]);
                }
                if ($request->method() === 'GET' && str_contains($request->url(), '/booking/reservations/')) {
                    return Http::response($reservation);
                }
                $this->fail('Unexpected Stays write.');
            }
            if (str_contains($request->url(), 'cieloecommerce.cielo.com.br')) {
                if ($scenario === 'different_cardholder_email' && $request->method() === 'POST') {
                    $this->assertSame('Another Payer', $request['Customer']['Name']);
                    $this->assertSame('52998224725', $request['Customer']['Identity']);
                }
                if ($queryNotFound && $request->method() === 'GET') {
                    return Http::response([], 404);
                }
                $attempt = $observeContradictoryCapture
                    ? DirectBookingPaymentAttempt::query()->where('gateway_payment_id', $gatewayId)->firstOrFail()
                    : (DirectBookingPaymentAttempt::query()->where('status', 'processing')->first() ?? DirectBookingPaymentAttempt::query()->sole());
                if ($scenario === 'webhook_timeout' && $request->method() === 'POST') {
                    // Represent a webhook that committed the capture before this worker timed out.
                    $attempt->forceFill(['status' => 'approved', 'gateway_status' => 'captured', 'gateway_payment_id' => $gatewayId, 'paid_at' => now()])->save();
                    $attempt->order->forceFill(['status' => DirectBookingOrderStatus::PagoEmConfirmacao, 'payment_status' => 'approved', 'paid_at' => now()])->save();
                    throw new ConnectionException('Synthetic timeout after webhook capture');
                }
                $amount = (int) round((float) $attempt->amount * 100);
                $isPix = $method === 'pix';
                $captured = (! $declineCard && ! $isPix) || ($request->method() === 'GET' && ! $delayedPendingResponse);
                $responsePaymentId = $scenario === 'declined' && DirectBookingPaymentAttempt::query()->count() > 1 && ! $observeContradictoryCapture
                    ? '123e4567-e89b-12d3-a456-426614174081' : $gatewayId;

                return Http::response(['MerchantOrderId' => $attempt->merchant_order_id, 'Payment' => [
                    'PaymentId' => $responsePaymentId, 'Type' => $isPix ? 'Pix' : 'CreditCard', 'Status' => $forcedGatewayStatus ?? ($declineCard ? 3 : ($captured ? 2 : 12)),
                    'Amount' => $amount, 'Currency' => 'BRL', 'CapturedDate' => $captured && ! $omitCapturedDate ? ($forcedCapturedDate ?? now()->toIso8601String()) : null,
                    'ExpirationDate' => now()->addMinutes(30)->toIso8601String(),
                    ...($isPix && ! $captured ? ['QrCodeString' => 'synthetic-pix-code', 'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic-qr")] : []),
                ]], 201);
            }
            $this->fail('Unexpected external request.');
        });

        if (str_starts_with($scenario, 'deposit_flag_off_') || $scenario === 'external_stats_after_qr') {
            config([
                'direct-booking.experimental_existing_deposit_enabled' => true,
                'direct-booking.experimental_existing_cycle_settlement_enabled' => true,
                'direct-booking.experimental_existing_ledger_audit_enabled' => true,
            ]);
            $this->mock(ExistingReservationLedgerAudit::class)
                ->shouldReceive('confirmsSnapshot')->andReturnTrue();
            $this->partialMock(ExistingReservationPaymentCycleRegistry::class, function ($mock) use ($reservationId): void {
                $mock->shouldReceive('prepare')->with($reservationId)->andReturn([
                    'verified' => [], 'verifiedCycles' => [], 'currentAudit' => null,
                    'auditsDisagree' => false, 'reservationId' => strtolower($reservationId),
                ]);
            });
        }
        $created = $this->withHeader('Idempotency-Key', 'existing-order-key-123456')->postJson('/api/existing-reservations/ZY92K/checkout', [
            'expectedBalanceCents' => 19750, 'paymentMethod' => $method, ...((str_starts_with($scenario, 'deposit_flag_off_') || $scenario === 'external_stats_after_qr') ? ['paymentPlan' => 'deposit'] : []), ...($method === 'card' ? ['installments' => 6] : []), 'guest' => ['fullName' => 'Test Guest', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance(),
        ]);
        $created->assertCreated();
        $this->assertDatabaseHas('existing_reservation_payment_locks', ['stays_reservation_id' => $reservationId]);
        if ($noReceivable) {
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');
        }
        if ($noReceivable) {
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');
        }
        $reference = $created->json('resume.reference');
        $token = $created->json('resume.token');
        $balanceChanged = $scenario === 'changed';
        if ($scenario === 'deposit_flag_off_before') {
            config(['direct-booking.experimental_existing_deposit_enabled' => false]);
        }
        if ($scenario === 'disabled') {
            config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        }
        if ($scenario === 'ledger_review') {
            config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
            $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->once()->andReturnFalse();
        }
        if ($scenario === 'ledger_changed_after_first_read') {
            config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
            $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->twice()->andReturn(true, false);
        }
        if ($scenario === 'historical_payment_disappeared') {
            config(['direct-booking.experimental_existing_ledger_audit_enabled' => true, 'direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
            $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->twice()->andReturnTrue();
            $verified = ['reservationId' => $reservationId, 'verified' => ['previous-attempt' => 'proof'], 'verifiedCycles' => ['previous-cycle' => 'proof'], 'currentAudit' => ['balance_cents' => 19750], 'auditsDisagree' => false];
            $missing = ['reservationId' => $reservationId, 'verified' => [], 'verifiedCycles' => [], 'currentAudit' => null, 'auditsDisagree' => false];
            $this->mock(ExistingReservationPaymentCycleRegistry::class)->shouldReceive('prepare')->twice()->with($reservationId)->andReturn($verified, $missing);
        }
        if ($scenario === 'cycle_without_ledger') {
            config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => false]);
        }
        if (in_array($scenario, ['approval_revoked', 'approval_changed', 'approval_expired', 'approval_valid', 'approval_status_changed', 'approval_partner_changed'], true)) {
            $order = DirectBookingOrder::query()->sole();
            $snapshot = $order->quote_snapshot;
            $snapshot['existing_reservation']['bootstrap_receivable'] = true;
            $snapshot['existing_reservation']['currency'] = 'BRL';
            $snapshot['existing_reservation']['approval_version'] = 'review-1';
            $order->update(['quote_snapshot' => $snapshot]);
            $approval = ['version' => $scenario === 'approval_changed' ? 'review-2' : 'review-1',
                'expires_at' => $scenario === 'approval_expired' ? '2020-01-01T00:00:00+00:00' : '2030-01-01T00:00:00+00:00',
                '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16',
                'guests' => 4, 'currency' => 'BRL', 'reservation_type' => 'booked', 'partner_name' => 'api booking.com', 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750];
            config(['direct-booking.experimental_existing_receivable_creation_enabled' => true,
                'direct-booking.experimental_existing_approved_balances' => $scenario === 'approval_revoked' ? [] : [$reservationId => $approval]]);
            if ($scenario === 'approval_status_changed') {
                $reservation['type'] = 'reserved';
            } elseif ($scenario === 'approval_partner_changed') {
                $reservation['partner']['name'] = 'API other';
            }
        }
        $payload = $method === 'pix'
            ? ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix', 'payerIdentification' => ['type' => 'CPF', 'number' => '52998224725']]
            : ['paymentMethod' => 'card', 'paymentMethodId' => 'cielo_credit_card', 'token' => '123e4567-e89b-12d3-a456-426614174000', 'installments' => 6, 'cardholderName' => $scenario === 'different_cardholder_email' ? 'Another Payer' : 'Test Guest', 'cardholderEmail' => $scenario === 'different_cardholder_email' ? 'payer@example.test' : 'guest@example.test', 'payerIdentification' => ['type' => 'CPF', 'number' => '52998224725']];
        if ($scenario === 'alphanumeric_cnpj') {
            $payload['payerIdentification'] = ['type' => 'CNPJ', 'number' => '12ABC34501DE35'];
        }
        if ($scenario === 'approved') {
            foreach ([['type' => 'CPF', 'number' => '11111111111'], ['type' => 'CNPJ', 'number' => '11222333000180']] as $invalidDocument) {
                $invalidPayload = array_replace($payload, ['payerIdentification' => $invalidDocument]);
                $this->withHeaders(['Idempotency-Key' => 'invalid-document-key-1234', 'X-Checkout-Resume-Token' => $token])
                    ->postJson('/api/checkout/'.$reference.'/payments', $invalidPayload)->assertUnprocessable()->assertJsonValidationErrors('payerIdentification.number');
            }
            $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
        }
        $response = $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload);
        if (in_array($scenario, ['stale_capture_after_refund', 'stale_capture_after_chargeback', 'capture_time_changed'], true)) {
            $response->assertCreated()->assertJsonPath('payment.status', 'approved');
            $order = DirectBookingOrder::query()->sole();
            $attempt = DirectBookingPaymentAttempt::query()->sole();
            if ($scenario === 'capture_time_changed') {
                $prior = now()->subMinutes(5)->startOfSecond();
                $attempt->forceFill(['paid_at' => $prior])->save();
                $order->forceFill(['paid_at' => $prior])->save();
                $result = app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
                $this->assertSame('attention_required', $result['attempt']->status);
                $this->assertSame('gateway_capture_time_mismatch', $attempt->fresh()->error_code);
                $this->assertTrue($attempt->fresh()->paid_at->equalTo($prior));
                $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->fresh()->status);
                $forcedGatewayStatus = 12;
                app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
                $this->assertSame('gateway_capture_time_mismatch', $attempt->fresh()->error_code);
                $forcedGatewayStatus = 2;
                $forcedCapturedDate = $prior->toIso8601String();
                app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
                $this->assertSame('gateway_capture_time_mismatch', $attempt->fresh()->error_code);
                $this->assertSame('attention_required', $order->fresh()->payment_status);
            } else {
                $refund = $scenario === 'stale_capture_after_refund';
                $order->forceFill(['status' => $refund ? DirectBookingOrderStatus::AtencaoOperacional : DirectBookingOrderStatus::Contestado,
                    'payment_status' => $refund ? 'refunded' : 'charged_back'])->save();
                $attempt->forceFill(['status' => 'attention_required', 'gateway_status' => $refund ? 'refunded' : 'charged_back', 'paid_at' => null])->save();
                foreach ([12, 1, 2] as $staleStatus) {
                    $forcedGatewayStatus = $staleStatus;
                    app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
                    $this->assertSame($refund ? 'refunded' : 'charged_back', $order->fresh()->payment_status);
                }
                $this->assertSame($refund ? 'refunded' : 'charged_back', $order->fresh()->payment_status);
                $this->assertSame($refund ? 'refunded' : 'charged_back', $attempt->fresh()->gateway_status);
                $this->assertNull($attempt->fresh()->paid_at);
            }
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');

            return;
        }
        if ($scenario === 'stale_cancel_after_capture') {
            $response->assertCreated()->assertJsonPath('payment.status', 'approved');
            $order = DirectBookingOrder::query()->sole();
            $attempt = DirectBookingPaymentAttempt::query()->sole();
            $forcedGatewayStatus = 10;
            app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
            $this->assertSame('approved', $order->fresh()->payment_status);
            $this->assertSame('captured', $attempt->fresh()->gateway_status);
            $this->assertNotNull($attempt->fresh()->paid_at);

            return;
        }
        if ($scenario === 'historical_invalid_document') {
            $response->assertCreated();
            $legacyPayload = $payload;
            $legacyPayload['payerIdentification']['number'] = '11111111111';
            ksort($legacyPayload);
            $fingerprint = hash_hmac('sha256', json_encode($legacyPayload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
            DirectBookingPaymentAttempt::query()->sole()->forceFill(['request_fingerprint' => $fingerprint])->save();
            $gatewayRequests = count(Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')));
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', $legacyPayload)->assertOk()->assertJsonPath('replayed', true);
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => 'invalid'])
                ->postJson('/api/checkout/'.$reference.'/payments', $legacyPayload)->assertNotFound();
            $this->withHeaders(['Idempotency-Key' => 'different-key-legacy-123456', 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', $legacyPayload)->assertUnprocessable()->assertJsonValidationErrors('payerIdentification.number');
            $legacyPayload['cardholderName'] = 'Changed';
            if ($method === 'pix') {
                unset($legacyPayload['cardholderName']);
                $legacyPayload['payerIdentification']['number'] = '22222222222';
            }
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', $legacyPayload)->assertConflict();
            $this->assertCount($gatewayRequests, Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')));

            return;
        }
        if ($scenario === 'deposit_flag_off_before') {
            $response->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
            $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br'));

            return;
        }
        if ($scenario === 'deposit_flag_off_after') {
            $this->assertSame(201, $response->status(), json_encode($response->json()));
            $response->assertJsonPath('payment.status', 'pending');
            $gatewayRequests = count(Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')));
            config(['direct-booking.experimental_existing_deposit_enabled' => false]);
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload)->assertOk()->assertJsonPath('payment.status', 'pending');
            $this->withHeaders(['Idempotency-Key' => 'other-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload)->assertStatus(409);
            config(['direct-booking.enabled' => false, 'services.cielo.merchant_id' => 'changed-merchant']);
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload)->assertOk()->assertJsonPath('replayed', true)->assertJsonPath('payment.status', 'pending');
            $changedPayload = $payload;
            $changedPayload['payerIdentification']['number'] = '11144477735';
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $changedPayload)->assertConflict();
            $this->withHeaders(['Idempotency-Key' => 'new-payment-key-outage-12345', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload)->assertStatus(503);
            $this->assertCount($gatewayRequests, Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')));

            return;
        }
        if (in_array($scenario, ['changed', 'disabled', 'approval_status_changed', 'approval_partner_changed', 'ledger_review', 'ledger_changed_after_first_read', 'historical_payment_disappeared', 'cycle_without_ledger'], true)) {
            if (in_array($scenario, ['disabled', 'cycle_without_ledger'], true)) {
                $response->assertStatus(503)->assertJsonPath('code', 'payments_disabled');
            } elseif (in_array($scenario, ['ledger_review', 'ledger_changed_after_first_read', 'historical_payment_disappeared'], true)) {
                $response->assertStatus(409)->assertJsonPath('code', 'existing_balance_unverified');
            } else {
                $response->assertStatus(409)->assertJsonPath('code', 'stays_reservation_mismatch');
            }
            $this->assertDatabaseCount('direct_booking_payment_attempts', 0);
            $this->assertDatabaseCount('existing_reservation_payment_cycles', 0);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br'));

            return;
        }
        if ($scenario === 'webhook_timeout') {
            $response->assertOk()->assertJsonPath('payment.status', 'approved');
            $this->assertSame('captured', DirectBookingPaymentAttempt::query()->sole()->gateway_status);
            $this->assertSame('approved', DirectBookingOrder::query()->sole()->payment_status);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');

            return;
        }
        if ($scenario === 'capture_time_missing') {
            $response->assertStatus(503)->assertJsonPath('payment.status', 'attention_required');
            $this->assertNull(DirectBookingPaymentAttempt::query()->sole()->paid_at);
            $this->assertSame('gateway_capture_time_unverified', DirectBookingPaymentAttempt::query()->sole()->error_code);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');

            return;
        }
        $this->assertSame(201, $response->status(), json_encode($response->json(), JSON_UNESCAPED_UNICODE));
        if ($scenario === 'declined') {
            $response->assertJsonPath('payment.status', 'rejected');
            $this->assertSame(DirectBookingOrderStatus::PagamentoRecusado, DirectBookingOrder::query()->sole()->status);
            $this->assertDatabaseHas('existing_reservation_payment_cycles', ['state' => 'declined', 'active_reservation_id' => null]);
            $declineCard = false;
            $this->withHeaders(['Idempotency-Key' => 'retry-payment-key-123456', 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', $payload)
                ->assertCreated()->assertJsonPath('payment.status', 'approved');
            $this->assertDatabaseCount('direct_booking_payment_attempts', 2);
            $this->assertDatabaseHas('existing_reservation_payment_cycles', ['state' => 'open', 'active_reservation_id' => $reservationId]);
            $observeContradictoryCapture = true;
            $conflict = app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
            $this->assertSame('attention_required', $conflict['attempt']->status);
            $this->assertSame('gateway_cycle_conflict', $conflict['attempt']->error_code);
            $this->assertSame('attention_required', DirectBookingOrder::query()->sole()->payment_status);
            $forcedGatewayStatus = 10;
            app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId);
            $conflictingAttempt = DirectBookingPaymentAttempt::query()->where('gateway_payment_id', $gatewayId)->firstOrFail();
            $this->assertSame('attention_required', $conflictingAttempt->status);
            $this->assertSame('gateway_cycle_conflict', $conflictingAttempt->error_code);
            $this->assertSame('captured', $conflictingAttempt->gateway_status);
            $this->assertNotNull($conflictingAttempt->paid_at);
            $gatewayRequests = count(Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br') && $request->method() === 'POST'));
            $this->withHeaders(['Idempotency-Key' => 'conflict-retry-key-123456', 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', $payload)->assertConflict();
            $this->assertDatabaseCount('direct_booking_payment_attempts', 2);
            $this->assertCount($gatewayRequests, Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br') && $request->method() === 'POST'));
            $this->assertFalse(app(DirectStaysPaymentService::class)->confirmPaidReservation(DirectBookingOrder::query()->sole())['ready']);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');

            return;
        }
        if ($method === 'pix') {
            $response->assertJsonPath('payment.status', 'pending')->assertJsonPath('payment.pix.copyPaste', 'synthetic-pix-code');
            $gatewayRequests = count(Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')));
            $this->withHeaders(['Idempotency-Key' => 'another-payment-key-123456', 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', $payload)
                ->assertStatus(409)->assertJsonPath('code', 'order_not_payable');
            $this->assertCount($gatewayRequests, Http::recorded(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')));
            if ($scenario === 'external_payment') {
                // The Stays balance may be updated manually after the QR is issued.
                $balanceChanged = true;
            } elseif ($scenario === 'external_stats_after_qr') {
                // Still leaves more than the candidate due, but the external receipt changed.
                $reservation['stats']['_f_totalPaid'] = 100;
            }
            $staleAttempt = DirectBookingPaymentAttempt::query()->sole();
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId)['attempt']->status);
            $originalPaidAt = DirectBookingPaymentAttempt::query()->sole()->paid_at->toISOString();
            $omitCapturedDate = true;
            $queryNotFound = true;
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileAttempt($staleAttempt)['attempt']->status);
            $this->assertSame('captured', DirectBookingPaymentAttempt::query()->sole()->gateway_status);
            $queryNotFound = false;
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId)['attempt']->status);
            $this->assertSame($originalPaidAt, DirectBookingPaymentAttempt::query()->sole()->paid_at->toISOString());
            $delayedPendingResponse = true;
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId)['attempt']->status);
            $this->assertSame('approved', DirectBookingOrder::query()->sole()->payment_status);
        } else {
            $response->assertJsonPath('payment.status', 'approved')->assertJsonPath('payment.amount', '240.86');
        }
        $order = DirectBookingOrder::query()->sole();
        if (in_array($scenario, ['external_payment', 'external_stats_after_qr'], true)) {
            $this->assertFalse(app(DirectStaysPaymentService::class)->confirmPaidReservation($order)['ready']);
            $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->fresh()->status);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');

            return;
        }
        if ($method === 'card') {
            $attempt = DirectBookingPaymentAttempt::query()->sole();
            $this->assertSame('197.50', $attempt->base_amount);
            $this->assertSame('240.86', $attempt->amount);
            $this->assertSame('43.36', $attempt->processing_fee_amount);
            $this->assertSame(1800, $attempt->processing_fee_basis_points);
            Http::assertSent(fn (Request $request) => str_contains($request->url(), 'cieloecommerce.cielo.com.br')
                && $request->method() === 'POST' && $request['Payment']['Amount'] === 24086);

        }
        $confirmation = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
        if ($scenario === 'unrecorded_partial') {
            $this->assertFalse($confirmation['ready']);
            $this->assertSame('existing_balance_remaining', $confirmation['code']);
            $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->fresh()->status);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/booking/reservations/')
                && $request->method() === 'PATCH' && ! str_contains($request->url(), '/payments/'));

            return;
        }
        $this->assertTrue($confirmation['ready']);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->fresh()->status);
        $this->assertSame('ZY92K', $order->fresh()->confirmedReservationCode());
        $this->assertTrue($completed);
        if ($noReceivable) {
            $this->assertCount(1, Http::recorded(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() === 'POST'));
            $this->assertSame('completed', $postedPayment['status']);
            $this->assertSame($method === 'card' ? 240.86 : 197.5, (float) $postedPayment['_f_val']);
            $this->assertSame('Cielo Site Externo', $postedPayment['name']);
            $this->assertSame($providerId, $postedPayment['_idpaymentProvider']);
            if ($scenario === 'unrecorded') {
                $this->assertSame(438.36, $reservation['stats']['_f_totalPaid']);
            }
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() === 'PATCH' && str_contains($request->url(), '/payments/'));
            Http::assertSent(fn (Request $request) => str_contains($request->url(), '/booking/reservations/')
                && $request->method() === 'PATCH' && $request['type'] === 'booked');
        } else {
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() === 'POST');
            $this->assertCount(1, Http::recorded(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() === 'PATCH'));
            Http::assertSent(fn (Request $request) => $request->method() === 'PATCH'
                && ($request['name'] ?? null) === 'Cielo Site Externo'
                && ($request['_f_val'] ?? null) === ($method === 'card' ? 240.86 : 197.5)
                && ! array_key_exists('_idpaymentProvider', $request->data()));
        }
    }

    public static function paymentMethods(): array
    {
        return ['cancelamento antigo após captura' => ['card', 'stale_cancel_after_capture'], 'captura antiga após estorno' => ['card', 'stale_capture_after_refund'], 'captura antiga após contestação' => ['card', 'stale_capture_after_chargeback'], 'horário de captura divergente' => ['card', 'capture_time_changed'], 'captura sem horário verificável' => ['card', 'capture_time_missing'], 'replay Pix com documento histórico inválido' => ['pix', 'historical_invalid_document'], 'replay cartão com documento histórico inválido' => ['card', 'historical_invalid_document'], 'flag depósito desligada antes' => ['pix', 'deposit_flag_off_before'], 'flag depósito desligada depois' => ['pix', 'deposit_flag_off_after'], 'Pix' => ['pix', 'approved'], 'cartão em 6 parcelas' => ['card', 'approved'], 'CNPJ alfanumérico no cartão' => ['card', 'alphanumeric_cnpj'], 'cartão de outro titular' => ['card', 'different_cardholder_email'], 'cartão sem recebível prévio' => ['card', 'unrecorded'], 'pagamento parcial não confirma reserva' => ['card', 'unrecorded_partial'], 'cartão recusado' => ['card', 'declined'], 'webhook antes do timeout' => ['card', 'webhook_timeout'], 'saldo alterado' => ['pix', 'changed'], 'baixa externa após QR' => ['pix', 'external_payment'], 'stats mudaram após QR' => ['pix', 'external_stats_after_qr'], 'fluxo desativado' => ['pix', 'disabled'], 'aprovação revogada' => ['pix', 'approval_revoked'], 'versão alterada' => ['pix', 'approval_changed'], 'aprovação expirada' => ['pix', 'approval_expired'], 'aprovação válida' => ['pix', 'approval_valid'], 'status alterado antes do pagamento' => ['pix', 'approval_status_changed'], 'parceiro alterado antes do pagamento' => ['pix', 'approval_partner_changed'], 'lançamento histórico desapareceu' => ['pix', 'historical_payment_disappeared'], 'ledger mudou entre leituras' => ['pix', 'ledger_changed_after_first_read'], 'ledger divergente antes da cobrança' => ['pix', 'ledger_review'], 'ciclo sem ledger' => ['pix', 'cycle_without_ledger']];
    }

    /** @return array{acceptedContract: array{version: string, contentHash: string}} */
    private function contractAcceptance(): array
    {
        $contract = app(LegalPageRegistry::class)->find('contrato');
        $this->assertIsArray($contract);

        return ['acceptedContract' => ['version' => $contract['version'], 'contentHash' => hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))]];
    }
}
