<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Resources\DirectBookingOrderResource;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Services\DirectStaysPaymentService;
use App\Services\DirectStaysReservationService;
use App\Services\ExistingReservationPaymentCycleRegistry;
use App\Services\LegalPageRegistry;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Synthetic end-to-end flow, with all Stays/Cielo traffic faked. */
class ExistingReservationBootstrapDepositJourneyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate');
    }

    public function test_bootstrap_deposit_then_remaining_balance_are_settled_sequentially(): void
    {
        $this->withoutExceptionHandling();
        config([
            'direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true,
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.experimental_existing_order_history_enabled' => true,
            'direct-booking.experimental_existing_deposit_enabled' => true, 'direct-booking.experimental_existing_cycle_settlement_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => true,
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
        $amounts = [10, 10];
        $index = 0;
        $paid = 0;
        $completed = [];
        $current = null;
        $date = now('America/Sao_Paulo')->toDateString();
        $reservationType = 'reserved';
        $financeUnavailable = false;
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$paid, &$completed, &$current, &$index, &$reservationType, &$financeUnavailable, $reservationId, $provider, $date) {
            $this->assertSame(0, DB::transactionLevel(), 'External HTTP must remain outside the reservation lock.');
            if (str_contains($request->url(), 'stays.test')) {
                if (str_contains($request->url(), '/finance/payment-providers/')) {
                    return Http::response(['_id' => $provider, 'status' => 'active', 'internalName' => 'Cielo Site Externo']);
                }
                if (str_contains($request->url(), '/content/listings/')) {
                    return Http::response(['_id' => str_repeat('e', 24), '_mstitle' => ['pt_BR' => 'Apartamento de teste']]);
                }
                if (str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/finance/accounting-transactions')) {
                    if ($financeUnavailable) {
                        return Http::response([], 503);
                    }
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
                if ($request->method() === 'POST' && str_ends_with($request->url(), '/payments')) {
                    $id = str_repeat((string) ($index + 1), 24);
                    $item = $request->data() + ['_id' => $id, '_idreserve' => $reservationId];
                    $this->assertSame('completed', $item['status']);
                    $completed[$id] = $item;
                    $paid += $item['_f_val'];

                    return Http::response($item, 201);
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
                if ($request->method() === 'PATCH' && str_ends_with($request->url(), '/booking/reservations/'.$reservationId)) {
                    $this->assertSame('booked', $request['type']);
                    $reservationType = 'booked';

                    return Http::response([]);
                }
                if ($request->method() === 'GET' && str_contains($request->url(), '/booking/reservations/')) {
                    return Http::response(['id' => 'ZY92K', 'partnerCode' => 'booking-test', '_id' => $reservationId,
                        '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => $reservationType,
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
        $summary = $this->getJson('/api/existing-reservations/ZY92K/checkout-summary');
        $summary->assertOk();
        $summary->assertJsonPath('reservation.paymentPlans.full.amountCents', 2000);
        $summary->assertJsonPath('reservation.paymentPlans.deposit.amountCents', 1000);

        foreach ($amounts as $index => $amount) {
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.($index + 1)]);
            $current = null;
            $created = $this->withHeader('Idempotency-Key', 'three-order-key-123456-'.$index)
                ->postJson('/api/existing-reservations/ZY92K/checkout', ['expectedBalanceCents' => (20 - $paid) * 100, 'paymentMethod' => 'pix', 'paymentPlan' => $index === 0 ? 'deposit' : 'full',
                    'guest' => ['fullName' => 'Test Guest', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()]);
            $this->assertSame(201, $created->status(), json_encode($created->json()));
            $this->assertSame(number_format($amount, 2, '.', ''), $created->json('order.quoteTotal'));
            $reference = $created->json('resume.reference');
            $token = $created->json('resume.token');
            $payment = $this->withHeaders(['Idempotency-Key' => 'three-payment-key-123456-'.$index, 'X-Checkout-Resume-Token' => $token])
                ->postJson('/api/checkout/'.$reference.'/payments', ['paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
                    'payerIdentification' => ['type' => 'CPF', 'number' => '52998224725']]);
            $this->assertSame(201, $payment->status(), json_encode($payment->json()));
            $payment->assertJsonPath('payment.status', 'approved');
            $order = DirectBookingOrder::query()->where('public_reference', $reference)->firstOrFail();
            $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
            if ($index === 0) {
                $this->assertTrue($result['ready'], json_encode($result));
                $this->assertSame('existing_deposit_settled', $result['code']);
                $this->assertSame('entrada_conciliada', $order->fresh()->status->value);
                $this->assertSame('booked', $reservationType);
                $attention = new \ReflectionMethod(DirectStaysPaymentService::class, 'attention');
                $staleOrder = $order->fresh();
                $staleOrder->status = DirectBookingOrderStatus::PagoEmConfirmacao;
                $lateResult = $attention->invoke(app(DirectStaysPaymentService::class), $staleOrder, 'existing_payment_not_confirmable', 'Resposta atrasada');
                $this->assertTrue($lateResult['ready']);
                $this->assertSame('entrada_conciliada', $order->fresh()->status->value);
                $replayed = app(DirectStaysPaymentService::class)->confirmPaidReservation($order->fresh());
                $this->assertTrue($replayed['ready']);
                $this->assertSame('existing_deposit_settled', $replayed['code']);
                $beginVerification = new \ReflectionMethod(DirectStaysPaymentService::class, 'beginDepositVerification');
                $finishVerification = new \ReflectionMethod(DirectStaysPaymentService::class, 'recordDepositVerification');
                $verificationService = app(DirectStaysPaymentService::class);
                $olderVerification = $beginVerification->invoke($verificationService, $order->fresh());
                $newerVerification = $beginVerification->invoke($verificationService, $order->fresh());
                $finishVerification->invoke($verificationService, $order->fresh(), $newerVerification, false);
                $finishVerification->invoke($verificationService, $order->fresh(), $olderVerification, true);
                $this->assertTrue((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $this->assertTrue($verificationService->confirmPaidReservation($order->fresh())['ready']);
                $this->assertFalse((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $this->assertSame('entrada_conciliada', $order->fresh()->status->value);
                $paymentId = array_key_first($completed);
                $originalPayment = $completed[$paymentId];
                unset($completed[$paymentId]);
                $missing = $attention->invoke(app(DirectStaysPaymentService::class), $staleOrder, 'existing_payment_not_confirmable', 'Resposta atrasada');
                $this->assertFalse($missing['ready']);
                $this->assertSame('existing_deposit_revalidation_required', $missing['code']);
                $this->assertTrue((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $this->assertSame('entrada_conciliada', $order->fresh()->status->value);
                $completed[$paymentId] = array_replace($originalPayment, ['desc' => 'alterado']);
                $changed = app(DirectStaysPaymentService::class)->confirmPaidReservation($order->fresh());
                $this->assertFalse($changed['ready']);
                $this->assertSame('existing_deposit_revalidation_required', $changed['code']);
                $completed[$paymentId] = $originalPayment;
                $this->assertTrue(app(DirectStaysPaymentService::class)->confirmPaidReservation($order->fresh())['ready']);
                $this->assertFalse((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $financeUnavailable = true;
                $unavailable = app(DirectStaysPaymentService::class)->confirmPaidReservation($order->fresh());
                $this->assertFalse($unavailable['ready']);
                $this->assertSame('existing_deposit_revalidation_required', $unavailable['code']);
                $this->assertSame('entrada_conciliada', $order->fresh()->status->value);
                $financeUnavailable = false;
                config(['direct-booking.experimental_existing_ledger_audit_enabled' => false]);
                $disabled = app(DirectStaysPaymentService::class)->confirmPaidReservation($order->fresh());
                $this->assertFalse($disabled['ready']);
                $this->assertSame('entrada_conciliada', $order->fresh()->status->value);
                config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
                $order->fresh()->forceFill(['deposit_verification_due_at' => now()->subDays(2)])->save(['timestamps' => false]);
                $financeUnavailable = true;
                // A second worker cannot reclaim a live lease, while an abandoned
                // lease can be retried once its explicit deadline passes.
                DB::table('direct_booking_orders')->where('id', $order->id)->update([
                    'deposit_verification_lease_token' => '11111111-1111-4111-8111-111111111111',
                    'deposit_verification_lease_until' => now()->addMinutes(5),
                ]);
                $this->assertSame(0, app(DirectStaysReservationService::class)->recover()['processed']);
                DB::table('direct_booking_orders')->where('id', $order->id)->update(['deposit_verification_lease_until' => now()->subSecond()]);
                $recovery = app(DirectStaysReservationService::class)->recover();
                $this->assertSame(1, $recovery['processed']);
                $this->assertSame(1, $recovery['attention']);
                $this->assertTrue((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $this->assertSame(0, app(DirectStaysReservationService::class)->recover()['processed']);
                // A failed check retries after the short interval, never on every scheduler run.
                $order->fresh()->forceFill(['deposit_verification_due_at' => now()->subSeconds(301)])->save(['timestamps' => false]);
                $this->assertSame(1, app(DirectStaysReservationService::class)->recover()['processed']);
                $this->assertSame(0, app(DirectStaysReservationService::class)->recover()['processed']);
                $financeUnavailable = false;
                $order->fresh()->forceFill(['deposit_verification_due_at' => now()->subSeconds(301)])->save(['timestamps' => false]);
                config(['direct-booking.experimental_existing_deposit_enabled' => false]);
                $this->assertSame(0, app(DirectStaysReservationService::class)->recover()['processed']);
                config(['direct-booking.experimental_existing_deposit_enabled' => true]);
                $this->assertSame(1, app(DirectStaysReservationService::class)->recover()['processed']);
                $this->assertFalse((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $order->fresh()->forceFill(['updated_at' => now()->subSeconds(301)])->save(['timestamps' => false]);
                $this->assertSame(0, app(DirectStaysReservationService::class)->recover()['processed']);
                // A process that stops after writing its start event leaves an
                // inconclusive generation, which also retries on the short interval.
                $crashed = $order->fresh();
                $events = $crashed->operational_events;
                $events[] = ['event' => 'existing_deposit_verification_started', 'id' => 'interrupted-generation', 'at' => now()->subSeconds(301)->toISOString()];
                $crashed->forceFill(['operational_events' => $events, 'deposit_verification_due_at' => now()->subSeconds(301)])->save(['timestamps' => false]);
                DB::table('direct_booking_orders')->where('id', $order->id)->update(['deposit_verification_due_at' => now()->subSeconds(301)]);
                $this->assertTrue((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $this->assertSame(1, app(DirectStaysReservationService::class)->recover()['processed']);
                $this->assertFalse((new DirectBookingOrderResource($order->fresh()))->resolve()['existingDepositReviewRequired']);
                $this->assertSame(0, app(DirectStaysReservationService::class)->recover()['processed']);
                if ($index === 0) {
                    $settledCycleCount = DB::table('existing_reservation_payment_cycles')->where('state', 'settled')->count();
                    $preparedCycles = app(ExistingReservationPaymentCycleRegistry::class)->prepare($reservationId);
                    $this->assertSame(1, $settledCycleCount);
                    $this->assertCount(1, $preparedCycles['verified'] ?? []);
                }

            } else {
                $this->assertTrue($result['ready'], json_encode($result));
            }
        }
        $posts = Http::recorded(fn (Request $request): bool => $request->method() === 'POST'
            && str_contains($request->url(), 'stays.test') && str_ends_with($request->url(), '/payments'));
        $this->assertCount(2, $posts);
        $this->assertSame([10.0, 10.0], $posts->map(fn ($pair) => (float) $pair[0]['_f_val'])->values()->all());
        $this->assertEquals(20, $paid);
        $this->assertSame('booked', $reservationType);
        $this->assertCount(2, $completed);
        $this->assertDatabaseCount('direct_booking_orders', 2);
        $this->assertDatabaseCount('direct_booking_payment_attempts', 2);
        $this->assertSame(2, DB::table('existing_reservation_payment_cycles')->where('state', 'settled')->count());
        $settledDeposit = DirectBookingOrder::query()->where('status', 'entrada_conciliada')->firstOrFail();
        $replayedAfterFullPayment = app(DirectStaysPaymentService::class)->confirmPaidReservation($settledDeposit);
        $this->assertTrue($replayedAfterFullPayment['ready']);
        $this->assertSame('existing_deposit_settled', $replayedAfterFullPayment['code']);
        $attention = new \ReflectionMethod(DirectStaysPaymentService::class, 'attention');
        $divergence = $attention->invoke(app(DirectStaysPaymentService::class), $settledDeposit, 'existing_reservation_changed', 'Divergência atual');
        $this->assertFalse($divergence['ready']);
        $this->assertSame('atencao_operacional', $settledDeposit->fresh()->status->value);
    }

    /** @return array{acceptedContract: array{version: string, contentHash: string}} */
    private function contractAcceptance(): array
    {
        $contract = app(LegalPageRegistry::class)->find('contrato');
        $this->assertIsArray($contract);

        return ['acceptedContract' => ['version' => $contract['version'], 'contentHash' => hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))]];
    }
}
