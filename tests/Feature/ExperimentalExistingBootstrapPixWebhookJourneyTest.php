<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Jobs\ReconcileCieloPaymentWebhook;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\DirectStaysPaymentService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/** Synthetic HTTP only; this does not verify production gateway or Stays behaviour. */
class ExperimentalExistingBootstrapPixWebhookJourneyTest extends TestCase
{
    use RefreshDatabase;

    public function test_bootstrap_pix_and_webhook_update_same_reservation_in_simulated_integrations(): void
    {
        $reservationId = str_repeat('c', 24);
        $paymentId = str_repeat('a', 24);
        $providerId = str_repeat('f', 24);
        $gatewayId = '123e4567-e89b-12d3-a456-426614174080';
        config([
            'direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true,
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.experimental_existing_receivable_creation_enabled' => true,
            'direct-booking.experimental_existing_approved_balances' => [$reservationId => ['version' => 'review-1', 'expires_at' => '2030-01-01T00:00:00+00:00',
                '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22',
                'guests' => 4, 'currency' => 'BRL', 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com', 'reservation_total_cents' => 101600, 'pending_amount_cents' => 101600]],
            'direct-booking.payment_provider' => 'cielo_sandbox', 'direct-booking.notification_queue_connection' => 'database',
            'direct-booking.resume_token_ttl_days' => 2, 'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => $providerId, 'direct-booking.stays_cielo_pix_provider_id' => $providerId,
            'services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'services.cielo.direct_environment' => 'sandbox', 'services.cielo.enabled' => true, 'services.cielo.sop_enabled' => true,
            'services.cielo.pix_enabled' => true, 'services.cielo.pix_qr_expiration_seconds' => 1800,
            'services.cielo.merchant_id' => 'test-merchant', 'services.cielo.merchant_key' => 'test-key',
            'services.cielo.sop_client_id' => 'test-sop-id', 'services.cielo.sop_client_secret' => 'test-sop-secret',
            'services.cielo.webhook_header_name' => 'X-Cielo-Secret', 'services.cielo.webhook_header_value' => 'synthetic-cielo-webhook-secret',
            'services.cielo.webhook_queue_connection' => 'database',
        ]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);
        $reservation = ['id' => 'ZX91K', '_id' => $reservationId, '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24),
            'type' => 'reserved', 'checkInDate' => '2030-11-19', 'checkOutDate' => '2030-11-22', 'guests' => 4,
            'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 1016], 'partner' => ['name' => 'API booking.com']];
        $commission = ['type' => 'debit', 'status' => 'pending', '_f_val' => 152.40, 'name' => 'res. fee API booking.com'];
        $created = false;
        $settled = false;
        $booked = false;
        $marker = null;
        $settlementDesc = null;
        Http::preventStrayRequests();
        Http::fake(function (Request $r) use ($reservation, $reservationId, $commission, $paymentId, $providerId, $gatewayId, &$created, &$settled, &$booked, &$marker, &$settlementDesc) {
            if (str_contains($r->url(), 'stays.test')) {
                if (str_contains($r->url(), '/finance/payment-providers/')) {
                    return Http::response(['_id' => $providerId, 'status' => 'active', 'internalName' => 'Pix API Cielo']);
                }
                if ($r->method() === 'POST' && str_ends_with($r->url(), '/payments')) {
                    $created = true;
                    $marker = $r['desc'];

                    return Http::response([], 200);
                }
                if ($r->method() === 'PATCH' && str_contains($r->url(), '/payments/')) {
                    $settled = true;
                    $settlementDesc = $r['desc'];

                    return Http::response([], 200);
                }
                if ($r->method() === 'PATCH' && str_contains($r->url(), '/booking/reservations/')) {
                    $booked = true;

                    return Http::response([], 200);
                }
                if (str_contains($r->url(), '/finance/accounting-transactions/')) {
                    return Http::response(['_id' => $paymentId, 'reserveId' => $reservationId, 'type' => 'credit', 'paid' => $settled,
                        'bankAccountId' => $providerId, '_mcval' => ['BRL' => 1016],
                        ...($settled ? ['payment' => ['paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString()]] : [])]);
                }
                if (str_ends_with($r->url(), '/payments')) {
                    $pending = ['_id' => $paymentId, '_idpaymentProvider' => $providerId, 'type' => 'credit', 'status' => 'pending', '_f_val' => 1016,
                        'expirationDate' => '2030-11-19', 'name' => 'Pagamento da reserva', 'desc' => $marker];
                    $credit = $settled ? array_replace($pending, ['status' => 'completed', 'paymentDate' => now()->timezone('America/Sao_Paulo')->toDateString(), 'desc' => $settlementDesc]) : $pending;

                    return Http::response($created ? [$commission, $credit] : [$commission]);
                }
                if ($r->method() === 'GET' && str_contains($r->url(), '/booking/reservations/')) {
                    return Http::response($booked ? array_replace($reservation, ['type' => 'booked']) : $reservation);
                }
                $this->fail('Unexpected synthetic Stays request.');
            }
            if (str_contains($r->url(), 'cieloecommerce.cielo.com.br')) {
                $attempt = DirectBookingPaymentAttempt::query()->sole();
                $captured = $r->method() === 'GET';

                return Http::response(['MerchantOrderId' => $attempt->merchant_order_id, 'Payment' => [
                    'PaymentId' => $gatewayId, 'Type' => 'Pix', 'Status' => $captured ? 2 : 12, 'Amount' => 101600, 'Currency' => 'BRL',
                    'CapturedDate' => $captured ? now()->toIso8601String() : null, 'ExpirationDate' => now()->addMinutes(30)->toIso8601String(),
                    ...(! $captured ? ['QrCodeString' => 'synthetic-pix', 'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic")] : []),
                ]], 201);
            }
            $this->fail('Unexpected synthetic external request.');
        });
        $createdOrder = $this->withHeader('Idempotency-Key', 'synthetic-bootstrap-order-123')->postJson('/api/existing-reservations/ZX91K/checkout', [
            'expectedBalanceCents' => 101600, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Synthetic Guest', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true,
        ])->assertCreated();
        $this->assertTrue($created);
        $this->assertFalse($settled);
        $this->assertFalse($booked);
        $this->assertSame('reserved', DirectBookingOrder::query()->sole()->reservation_status);
        $orderId = DirectBookingOrder::query()->sole()->id;
        Http::assertSent(fn (Request $r) => $r->method() === 'POST' && str_ends_with($r->url(), '/payments')
            && $r['_idpaymentProvider'] === $providerId && $r['type'] === 'credit' && $r['status'] === 'pending'
            && $r['_f_val'] === 1016 && $r['expirationDate'] === '2030-11-19'
            && $r['desc'] === 'CRCN_EXISTING_ORDER:'.$orderId.':PENDING');
        $reference = $createdOrder->json('resume.reference');
        $token = $createdOrder->json('resume.token');
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->andReturnTrue();
        $this->withHeaders(['Idempotency-Key' => 'synthetic-bootstrap-pix-1234', 'X-Checkout-Resume-Token' => $token])
            ->postJson('/api/checkout/'.$reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix', 'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']])
            ->assertCreated()->assertJsonPath('payment.status', 'pending')->assertJsonPath('payment.pix.copyPaste', 'synthetic-pix');
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => false]);
        $this->withHeaders(['Idempotency-Key' => 'synthetic-bootstrap-pix-1234', 'X-Checkout-Resume-Token' => $token])
            ->postJson('/api/checkout/'.$reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix', 'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']])
            ->assertOk()->assertJsonPath('payment.status', 'pending');
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST' && str_contains($r->url(), 'cieloecommerce.cielo.com.br')));
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $this->assertFalse($settled);
        $this->assertFalse($booked);
        $this->assertSame('reserved', DirectBookingOrder::query()->sole()->reservation_status);
        $this->postJson('/api/webhooks/cielo', ['PaymentId' => $gatewayId, 'ChangeType' => 1], ['X-Cielo-Secret' => 'synthetic-cielo-webhook-secret'])->assertOk();
        Queue::assertPushed(ReconcileCieloPaymentWebhook::class, 1);
        $webhook = DirectBookingPaymentWebhook::query()->sole();
        (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class), app(DirectStaysPaymentService::class));
        $this->assertSame('processed', $webhook->fresh()->status);
        $this->assertSame('approved', DirectBookingPaymentAttempt::query()->sole()->status);
        $this->assertSame(DirectBookingOrderStatus::Confirmado, DirectBookingOrder::query()->sole()->status);
        $this->assertTrue($settled);
        $this->assertTrue($booked);
        $this->assertCount(1, Http::recorded(fn (Request $r) => $r->method() === 'POST' && str_ends_with($r->url(), '/payments')));
        Http::assertNotSent(fn (Request $r) => $r->method() === 'DELETE');
    }
}
