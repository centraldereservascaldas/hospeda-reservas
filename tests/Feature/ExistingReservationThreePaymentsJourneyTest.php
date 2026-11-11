<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysPaymentService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Synthetic end-to-end flow, with all Stays/Cielo traffic faked. */
class ExistingReservationThreePaymentsJourneyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate');
    }

    public function test_three_sequential_checkout_capture_and_settlements(): void
    {
        $this->withoutExceptionHandling();
        config([
            'direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true,
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.experimental_existing_order_history_enabled' => true,
            'direct-booking.experimental_existing_cycle_settlement_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => true,
            'direct-booking.payment_provider' => 'cielo_sandbox',
            'direct-booking.notification_queue_connection' => 'database', 'direct-booking.resume_token_ttl_days' => 2,
            'direct-booking.stays_payment_type' => 'credit', 'direct-booking.stays_payment_provider_id' => 'provider',
            'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24),
            'services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'services.cielo.direct_environment' => 'sandbox', 'services.cielo.enabled' => true, 'services.cielo.pix_enabled' => true,
            'services.cielo.pix_qr_expiration_seconds' => 1800, 'services.cielo.merchant_id' => 'test-merchant', 'services.cielo.merchant_key' => 'test-key',
        ]);
        $reservationId = str_repeat('c', 24);
        $provider = str_repeat('f', 24);
        $amounts = [10, 6, 4];
        $index = 0;
        $paid = 0;
        $completed = [];
        $current = null;
        $date = now('America/Sao_Paulo')->toDateString();
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$paid, &$completed, &$current, &$index, $reservationId, $provider, $date) {
            $this->assertSame(0, DB::transactionLevel(), 'External HTTP must remain outside the reservation lock.');
            if (str_contains($request->url(), 'stays.test')) {
                if (str_contains($request->url(), '/finance/payment-providers/')) {
                    return Http::response(['_id' => $provider, 'status' => 'active', 'internalName' => 'Cielo Site Externo']);
                }
                if (str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/finance/accounting-transactions')) {
                    $rows = [];
                    foreach ([...array_values($completed), ...($current ? [$current] : [])] as $item) {
                        $settled = $item['status'] === 'completed';
                        $rows[] = ['_id' => $item['_id'], 'reserveId' => $reservationId, 'type' => 'credit', 'paid' => $settled,
                            'bankAccountId' => $provider, '_mcval' => ['BRL' => $item['_f_val']],
                            ...($settled ? ['payment' => ['paymentDate' => $date]] : [])];
                    }

                    return Http::response($rows);
                }
                if (str_contains($request->url(), '/finance/accounting-transactions/')) {
                    $id = basename($request->url());
                    $item = $completed[$id] ?? null;

                    return $item ? Http::response(['_id' => $id, 'reserveId' => $reservationId, 'type' => 'credit', 'paid' => true,
                        'bankAccountId' => $provider, '_mcval' => ['BRL' => $item['_f_val']], 'payment' => ['paymentDate' => $date]]) : Http::response([], 404);
                }
                if ($request->method() === 'PATCH' && str_contains($request->url(), '/payments/')) {
                    $item = $current;
                    $item['status'] = 'completed';
                    $item['paymentDate'] = $date;
                    $item['desc'] = $request['desc'];
                    $item['name'] = $request['name'];
                    $completed[$item['_id']] = $item;
                    $paid += $item['_f_val'];
                    $current = null;

                    return Http::response([]);
                }
                if ($request->method() === 'GET' && str_contains($request->url(), '/payments/')) {
                    $id = basename($request->url());
                    $item = $completed[$id] ?? (($current['_id'] ?? null) === $id ? $current : null);

                    return $item ? Http::response($item) : Http::response([], 404);
                }
                if (str_ends_with($request->url(), '/payments')) {
                    return Http::response([...array_values($completed), ...($current ? [$current] : [])]);
                }
                if ($request->method() === 'GET' && str_contains($request->url(), '/booking/reservations/')) {
                    return Http::response(['id' => 'ZY92K', 'partnerCode' => 'booking-test', '_id' => $reservationId,
                        '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked',
                        'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 1,
                        'creationDate' => now('America/Sao_Paulo')->toDateString(),
                        'guestsDetails' => ['adults' => 1, 'children' => 0, 'infants' => 0],
                        'price' => ['currency' => 'BRL', '_f_total' => 20], 'stats' => ['_f_totalPaid' => $paid], 'partner' => ['name' => 'API booking.com']]);
                }
            }
            if (str_contains($request->url(), 'cieloecommerce.cielo.com.br')) {
                $attempt = DirectBookingPaymentAttempt::query()->where('status', 'processing')->firstOrFail();

                return Http::response(['MerchantOrderId' => $attempt->merchant_order_id, 'Payment' => [
                    'PaymentId' => sprintf('123e4567-e89b-12d3-a456-%012d', $index + 1), 'Type' => 'Pix', 'Status' => 2,
                    'Amount' => (int) round((float) $attempt->amount * 100), 'Currency' => 'BRL', 'CapturedDate' => now()->toIso8601String(),
                ]], 201);
            }
            $this->fail('Unexpected external request: '.$request->method().' '.$request->url());
        });
        foreach ($amounts as $index => $amount) {
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.($index + 1)]);
            $current = ['_id' => str_repeat((string) ($index + 1), 24), '_idreserve' => $reservationId, '_idpaymentProvider' => $provider,
                'type' => 'credit', 'status' => 'pending', '_f_val' => $amount, 'name' => 'Pagamento da reserva'];
            $created = $this->withHeader('Idempotency-Key', 'three-order-key-123456-'.$index)
                ->postJson('/api/existing-reservations/ZY92K/checkout', ['expectedBalanceCents' => $amount * 100, 'paymentMethod' => 'pix',
                    'guest' => ['fullName' => 'Test Guest', 'email' => 'guest@example.test', 'phone' => '64999999999'], 'acceptedPayment' => true]);
            $this->assertSame(201, $created->status(), json_encode($created->json()));
            $reference = $created->json('resume.reference');
            $token = $created->json('resume.token');
            $payment = $this->withHeaders(['Idempotency-Key' => 'three-payment-key-123456-'.$index, 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
                    'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']]);
            $this->assertSame(201, $payment->status(), json_encode($payment->json()));
            $payment->assertJsonPath('payment.status', 'approved');
            $order = DirectBookingOrder::query()->where('public_reference', $reference)->firstOrFail();
            $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
            if ($index < 2) {
                $this->assertFalse($result['ready'], json_encode($result));
                $this->assertSame('existing_balance_remaining', $result['code']);
            } else {
                $this->assertTrue($result['ready'], json_encode($result));
            }
        }
        $this->assertSame(20, $paid);
        $this->assertCount(3, $completed);
        $this->assertDatabaseCount('direct_booking_orders', 3);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 3);
        $this->assertSame(3, DB::table('existing_reservation_payment_cycles')->where('state', 'settled')->count());
    }
}
