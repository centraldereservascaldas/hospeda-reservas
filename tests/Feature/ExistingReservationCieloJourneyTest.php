<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysPaymentService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExistingReservationCieloJourneyTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('paymentMethods')]
    public function test_booking_payment_reuses_reservation_and_settles_its_receivable(string $method, string $scenario): void
    {
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
        $installments = $scenario === 'one_installment' ? 1 : 6;
        $providerId = $method === 'pix' ? str_repeat('f', 24) : str_repeat((string) $installments, 24);
        $reservation = ['id' => 'ZY92K', 'partnerCode' => 'booking-partner-code', '_id' => $reservationId, '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']];
        if ($scenario === 'external_stats_after_qr') {
            $reservation['stats'] = ['_f_totalPaid' => 0];
        }
        if ($scenario === 'financial_paid') {
            $reservation['creationDate'] = now('America/Sao_Paulo')->toDateString();
            $reservation['stats'] = ['_f_totalPaid' => 0];
        }
        $receivable = ['_idpaymentProvider' => $providerId, '_id' => $paymentId, 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $completed = false;
        $settlementDesc = null;
        $balanceChanged = false;
        $delayedPendingResponse = false;
        $declineCard = $scenario === 'declined';
        $observeContradictoryCapture = false;
        $queryNotFound = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$completed, &$settlementDesc, &$balanceChanged, &$delayedPendingResponse, &$declineCard, &$observeContradictoryCapture, &$queryNotFound, &$reservation, $receivable, $gatewayId, $method, $scenario, $providerId, $installments) {
            // RefreshDatabase wraps the test in one transaction; external calls
            // must not run inside the nested reservation-lock transaction.
            $this->assertLessThanOrEqual(1, DB::transactionLevel());
            if (str_contains($request->url(), 'stays.test')) {
                if ($scenario === 'financial_paid' && str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/finance/accounting-transactions')) {
                    return Http::response([['_id' => $receivable['_id'], 'reserveId' => $reservation['_id'], 'type' => 'credit', 'paid' => true,
                        'bankAccountId' => $providerId, '_mcval' => ['BRL' => 197.50], 'payment' => ['paymentDate' => '2026-11-10']]]);
                }
                if ($scenario === 'financial_paid' && str_ends_with($request->url(), '/payments/'.$receivable['_id'])) {
                    return Http::response([...$receivable, '_idreserve' => $reservation['_id']]);
                }
                if ($request->method() === 'GET' && str_ends_with($request->url(), '/booking/clients/'.$reservation['_idclient'])) {
                    return Http::response(['_id' => $reservation['_idclient']]);
                }
                if (str_contains($request->url(), '/content/listings/')) {
                    return Http::response([]);
                }
                if (str_contains($request->url(), '/finance/payment-providers/')) {
                    return Http::response(['_id' => $providerId, 'status' => 'active', 'internalName' => $method === 'pix' ? 'Pix API Cielo' : 'Cartão API Cielo '.$installments.'x']);
                }
                if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                    return Http::response(['_id' => $receivable['_id'], 'reserveId' => $reservation['_id'], 'type' => 'credit', 'paid' => $completed,
                        'bankAccountId' => $providerId, '_mcval' => ['BRL' => 197.50],
                        ...($completed ? ['payment' => ['paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString()]] : [])]);
                }
                if ($request->method() === 'PATCH' && str_contains($request->url(), '/payments/')) {
                    $completed = true;
                    $settlementDesc = $request['desc'];

                    return Http::response([]);
                }
                if (str_ends_with($request->url(), '/payments')) {
                    return Http::response([$completed ? array_replace($receivable, ['status' => 'completed', 'paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString(), '_idpaymentProvider' => $providerId, 'desc' => $settlementDesc]) : ($balanceChanged ? array_replace($receivable, ['_f_val' => 100]) : $receivable)]);
                }
                if ($request->method() === 'GET' && str_contains($request->url(), '/booking/reservations/')) {
                    return Http::response($reservation);
                }
                $this->fail('Unexpected Stays write.');
            }
            if (str_contains($request->url(), 'cieloecommerce.cielo.com.br')) {
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
                    'PaymentId' => $responsePaymentId, 'Type' => $isPix ? 'Pix' : 'CreditCard', 'Status' => $declineCard ? 3 : ($captured ? 2 : 12),
                    'Amount' => $amount, 'Currency' => 'BRL', 'CapturedDate' => $captured ? now()->toIso8601String() : null,
                    'ExpirationDate' => now()->addMinutes(30)->toIso8601String(),
                    ...($isPix && ! $captured ? ['QrCodeString' => 'synthetic-pix-code', 'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic-qr")] : []),
                ]], 201);
            }
            $this->fail('Unexpected external request.');
        });

        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->andReturnTrue();
        if ($method === 'card' && in_array($scenario, ['approved', 'one_installment'], true)) {
            $this->getJson('/api/existing-reservations/ZY92K/checkout-summary')->assertOk()
                ->assertJsonPath('reservation.paymentMethods', ['card'])
                ->assertJsonPath('reservation.cardInstallments', [$installments]);
        }
        $created = $this->withHeader('Idempotency-Key', 'existing-order-key-123456')->postJson('/api/existing-reservations/ZY92K/checkout', [
            'expectedBalanceCents' => 19750, 'paymentMethod' => $method, ...($method === 'card' ? ['installments' => $installments] : []), 'guest' => ['fullName' => 'Test Guest', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true,
        ]);
        $created->assertCreated();
        $this->assertDatabaseHas('existing_reservation_payment_locks', ['stays_reservation_id' => $reservationId]);
        $reference = $created->json('resume.reference');
        $token = $created->json('resume.token');
        $this->app->forgetInstance(ExistingReservationLedgerAudit::class);
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => false]);
        $balanceChanged = $scenario === 'changed';
        if ($scenario === 'financial_paid') {
            config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        } elseif (! in_array($scenario, ['ledger_off', 'cycle_without_ledger'], true)) {
            config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
            $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->andReturn($scenario !== 'ledger_review');
        }
        if ($scenario === 'disabled') {
            config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        }
        if ($scenario === 'ledger_review') {
            config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
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
            ? ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix', 'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']]
            : ['paymentMethod' => 'card', 'paymentMethodId' => 'cielo_credit_card', 'token' => '123e4567-e89b-12d3-a456-426614174000', 'installments' => $installments, 'cardholderName' => 'Test Guest', 'cardholderEmail' => 'guest@example.test', 'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']];
        $response = $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload);
        if (in_array($scenario, ['changed', 'disabled', 'approval_revoked', 'approval_changed', 'approval_expired', 'approval_status_changed', 'approval_partner_changed', 'ledger_review', 'ledger_off', 'financial_paid', 'cycle_without_ledger'], true)) {
            if ($scenario === 'disabled') {
                $response->assertStatus(503)->assertJsonPath('code', 'payments_disabled');
            } elseif (in_array($scenario, ['approval_revoked', 'approval_changed', 'approval_expired', 'ledger_review', 'ledger_off', 'financial_paid', 'cycle_without_ledger'], true)) {
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
            $queryNotFound = true;
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileAttempt($staleAttempt)['attempt']->status);
            $this->assertSame('captured', DirectBookingPaymentAttempt::query()->sole()->gateway_status);
            $queryNotFound = false;
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId)['attempt']->status);
            $delayedPendingResponse = true;
            $this->assertSame('approved', app(DirectCheckoutPaymentService::class)->reconcileCieloPaymentId($gatewayId)['attempt']->status);
            $this->assertSame('approved', DirectBookingOrder::query()->sole()->payment_status);
        } else {
            $response->assertJsonPath('payment.status', 'approved')->assertJsonPath('payment.amount', $installments === 1 ? '210.09' : '240.86');
            $attempt = DirectBookingPaymentAttempt::query()->sole();
            $this->assertSame('197.50', $attempt->base_amount);
            $this->assertSame($installments === 1 ? '12.59' : '43.36', $attempt->processing_fee_amount);
            $this->withHeaders(['Idempotency-Key' => 'existing-payment-key-123456', 'X-Checkout-Resume-Token' => $token])->postJson('/api/checkout/'.$reference.'/payments', $payload)->assertOk();
            $this->assertDatabaseCount('direct_booking_payment_attempts', 1);
        }
        $order = DirectBookingOrder::query()->sole();
        if (in_array($scenario, ['external_payment', 'external_stats_after_qr'], true)) {
            $this->assertFalse(app(DirectStaysPaymentService::class)->confirmPaidReservation($order)['ready']);
            $this->assertSame(DirectBookingOrderStatus::AtencaoOperacional, $order->fresh()->status);
            Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() !== 'GET');

            return;
        }
        $this->assertTrue(app(DirectStaysPaymentService::class)->confirmPaidReservation($order)['ready']);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->fresh()->status);
        $this->assertSame('ZY92K', $order->fresh()->confirmedReservationCode());
        $this->assertTrue($completed);
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() === 'POST');
        $this->assertCount(1, Http::recorded(fn (Request $request) => str_contains($request->url(), 'stays.test') && $request->method() === 'PATCH'));
        Http::assertSent(fn (Request $request) => $request->method() === 'PATCH'
            && ($request['name'] ?? null) === ($method === 'pix' ? 'Pix API Cielo' : 'Cartão API Cielo '.$installments.'x')
            && ! array_key_exists('_idpaymentProvider', $request->data()));
    }

    public static function paymentMethods(): array
    {
        return ['Pix' => ['pix', 'approved'], 'cartão em 1 parcela' => ['card', 'one_installment'], 'cartão em 6 parcelas' => ['card', 'approved'], 'cartão recusado' => ['card', 'declined'], 'webhook antes do timeout' => ['card', 'webhook_timeout'], 'saldo alterado' => ['pix', 'changed'], 'baixa externa após QR' => ['pix', 'external_payment'], 'stats mudaram após QR' => ['pix', 'external_stats_after_qr'], 'fluxo desativado' => ['pix', 'disabled'], 'aprovação revogada' => ['pix', 'approval_revoked'], 'versão alterada' => ['pix', 'approval_changed'], 'aprovação expirada' => ['pix', 'approval_expired'], 'aprovação válida' => ['pix', 'approval_valid'], 'status alterado antes do pagamento' => ['pix', 'approval_status_changed'], 'parceiro alterado antes do pagamento' => ['pix', 'approval_partner_changed'], 'ledger divergente antes da cobrança' => ['pix', 'ledger_review'], 'auditoria desligada' => ['pix', 'ledger_off'], 'financeiro pago e reserva pendente' => ['pix', 'financial_paid'], 'ciclo sem ledger' => ['pix', 'cycle_without_ledger']];
    }
}
