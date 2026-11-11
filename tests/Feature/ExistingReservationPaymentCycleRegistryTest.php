<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Requests\StoreCheckoutPaymentRequest;
use App\Models\DirectBookingOrder;
use App\Services\DirectStaysReservationService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\ExistingReservationPaymentCycleRegistry;
use App\Services\ExistingReservationPaymentLock;
use App\Services\ExistingReservationSettlement;
use App\Services\ExperimentalExistingCycleSettlement;
use App\Services\Payments\CieloCheckoutPaymentService;
use App\Services\StaysExternalApiClient;
use App\Services\StaysReservationIdentity;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExistingReservationPaymentCycleRegistryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('migrate');
    }

    public function test_one_open_cycle_and_idempotent_replay_per_reservation(): void
    {
        $reservation = str_repeat('a', 24);
        $order = $this->order($reservation);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $first = $registry->open($reservation, $order->id, 'cycle-key-12345678');

        $this->assertSame('opened', $first['status']);
        $this->assertSame(['status' => 'replayed', 'cycle_id' => $first['cycle_id']], $registry->open(strtoupper($reservation), $order->id, 'cycle-key-12345678'));
        $this->assertSame('cycle_in_progress', $registry->open($reservation, $order->id, 'another-key-12345678')['status']);
        $this->assertDatabaseCount('existing_reservation_payment_cycles', 1);
    }

    public function test_historical_rows_can_coexist_with_a_new_open_cycle_without_a_close_operation(): void
    {
        $reservation = str_repeat('a', 24);
        $order = $this->order($reservation);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $first = $registry->open($reservation, $order->id, 'cycle-key-12345678');
        // Simulate a future verified reconciliation; the registry has no close API.
        DB::table('existing_reservation_payment_cycles')->where('id', $first['cycle_id'])->update(['state' => 'settled', 'active_reservation_id' => null]);
        $second = $registry->open($reservation, $order->id, 'another-key-12345678');

        $this->assertSame('opened', $second['status']);
        $this->assertNotSame($first['cycle_id'], $second['cycle_id']);
        $this->assertDatabaseCount('existing_reservation_payment_cycles', 2);
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $first['cycle_id'], 'state' => 'settled']);
    }

    public function test_unresolved_attempt_or_different_reservation_blocks_a_new_cycle(): void
    {
        $reservation = str_repeat('a', 24);
        $order = $this->order($reservation);
        $order->paymentAttempts()->create([
            'idempotency_key' => 'attempt-key-12345678', 'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'unknown', 'amount' => '10.00', 'currency' => 'BRL',
        ]);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);

        $this->assertSame('payment_requires_reconciliation', $registry->open($reservation, $order->id, 'cycle-key-12345678')['status']);
        $this->assertSame('order_reservation_mismatch', $registry->open(str_repeat('b', 24), $order->id, 'cycle-key-12345678')['status']);
        $this->assertDatabaseCount('existing_reservation_payment_cycles', 0);
    }

    public function test_approved_payment_without_confirmed_settlement_cannot_release_cycle(): void
    {
        $reservation = str_repeat('a', 24);
        $order = $this->order($reservation);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $cycle = $registry->open($reservation, $order->id, 'cycle-key-12345678');
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'approved-attempt-12345678', 'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'processing', 'amount' => '10.00', 'currency' => 'BRL',
        ]);
        app(ExistingReservationPaymentLock::class)->synchronized($reservation, function () use ($registry, $cycle, $order, $attempt): void {
            $this->assertTrue($registry->bindAttempt($cycle['cycle_id'], $order, $attempt));
            $attempt->update(['status' => 'approved']);
        });

        $this->assertSame('cycle_in_progress', $registry->open($reservation, $order->id, 'another-key-12345678')['status']);
        DB::table('existing_reservation_payment_cycles')->where('id', $cycle['cycle_id'])->update(['state' => 'settled', 'active_reservation_id' => null]);
        $this->assertSame('payment_requires_reconciliation', $registry->open($reservation, $order->id, 'another-key-12345678')['status']);
    }

    public function test_unresolved_website_attempts_are_found_by_verified_code_or_persisted_canonical_id(): void
    {
        $reservation = str_repeat('a', 24);
        $existing = $this->order($reservation);
        $website = $this->order('AB12C');
        $website->update(['origin' => 'website']);
        $attempt = $website->paymentAttempts()->create([
            'idempotency_key' => 'attempt-alias-12345678', 'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'pending', 'amount' => '10.00', 'currency' => 'BRL',
        ]);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $this->assertSame('payment_requires_reconciliation', $registry->open($reservation, $existing->id, 'cycle-key-12345678', 'AB12C')['status']);
        $attempt->update(['stays_reservation_canonical_id' => $reservation]);
        $this->assertSame('payment_requires_reconciliation', $registry->open($reservation, $existing->id, 'cycle-key-12345678')['status']);
        $this->assertDatabaseCount('existing_reservation_payment_cycles', 0);
    }

    public function test_idempotency_key_cannot_be_reused_for_another_reservation(): void
    {
        $first = $this->order(str_repeat('a', 24));
        $second = $this->order(str_repeat('b', 24));
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $registry->open($first->stays_reservation_id, $first->id, 'cycle-key-12345678');

        $result = $registry->open($second->stays_reservation_id, $second->id, 'cycle-key-12345678');

        $this->assertSame(['status' => 'idempotency_conflict', 'cycle_id' => null], $result);
        $this->assertDatabaseCount('existing_reservation_payment_cycles', 1);
    }

    public function test_nonterminal_or_pix_attempt_never_releases_cycle(): void
    {
        $reservation = str_repeat('a', 24);
        $order = $this->order($reservation);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $cycle = $registry->open($reservation, $order->id, 'cycle-key-12345678');
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'attempt-key-12345678', 'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'processing', 'amount' => '10.00', 'currency' => 'BRL',
        ]);
        app(ExistingReservationPaymentLock::class)->synchronized($reservation, function () use ($registry, $cycle, $order, $attempt): void {
            $this->assertTrue($registry->bindAttempt($cycle['cycle_id'], $order, $attempt));
            $this->assertFalse($registry->closeDeclined($order, $attempt));
            $attempt->forceFill(['status' => 'rejected', 'gateway_status' => 'rejected', 'gateway_payment_id' => 'test-id'])->save();
            $this->assertFalse($registry->closeDeclined($order, $attempt));
        });

        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle['cycle_id'], 'state' => 'open', 'active_reservation_id' => $reservation]);
    }

    public function test_database_rejects_two_open_cycles_even_if_registry_is_bypassed(): void
    {
        $reservation = str_repeat('a', 24);
        $order = $this->order($reservation);
        app(ExistingReservationPaymentCycleRegistry::class)->open($reservation, $order->id, 'cycle-key-12345678');

        $this->expectException(QueryException::class);
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => '11111111-1111-4111-8111-111111111111', 'stays_reservation_id' => $reservation,
            'active_reservation_id' => $reservation, 'direct_booking_order_id' => $order->id,
            'idempotency_key' => 'another-key-12345678', 'state' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_experimental_settlement_closes_only_after_consistent_audit_and_preserves_charge_block(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->times(3)->andReturn([
            'status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000,
            'pending_payment_id' => str_repeat('b', 24), 'pending_provider_id' => str_repeat('f', 24), 'pending_cents' => 1000,
        ]);
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle, 'state' => 'settled', 'active_reservation_id' => null]);
        $this->assertNotNull(DB::table('existing_reservation_payment_cycles')->where('id', $cycle)->value('settlement_proof_hash'));
        $this->assertSame('payment_requires_reconciliation', app(ExistingReservationPaymentCycleRegistry::class)->open($order->stays_reservation_id, $order->id, 'second-cycle-12345678', null, app(ExistingReservationPaymentCycleRegistry::class)->prepare($order->stays_reservation_id))['status']);
    }

    public function test_settled_cycle_does_not_release_when_attempt_is_refunded(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->once()->andReturn([
            'status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000,
        ]);
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $attempt->update(['status' => 'refunded']);
        $this->assertSame('payment_requires_reconciliation', app(ExistingReservationPaymentCycleRegistry::class)->open($order->stays_reservation_id, $order->id, 'second-cycle-12345678', null, app(ExistingReservationPaymentCycleRegistry::class)->prepare($order->stays_reservation_id))['status']);
    }

    public function test_reopening_fails_when_balance_changes(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->twice()->andReturn(
            ['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000],
            ['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1500, 'balance_cents' => 500],
        );
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertSame('payment_requires_reconciliation', app(ExistingReservationPaymentCycleRegistry::class)->open($order->stays_reservation_id, $order->id, 'second-cycle-12345678', null, app(ExistingReservationPaymentCycleRegistry::class)->prepare($order->stays_reservation_id))['status']);
    }

    public function test_feature_disabled_after_settlement_still_blocks_reopening(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->once()->andReturn([
            'status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000,
        ]);
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($order));
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => false]);
        $this->assertSame('payment_requires_reconciliation', app(ExistingReservationPaymentCycleRegistry::class)->open($order->stays_reservation_id, $order->id, 'second-cycle-12345678', null, app(ExistingReservationPaymentCycleRegistry::class)->prepare($order->stays_reservation_id))['status']);
    }

    public function test_reopening_rechecks_attempt_mutation_during_external_audit(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $count = 0;
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->twice()->andReturnUsing(function () use ($attempt, &$count) {
            if (++$count === 2) {
                $attempt->update(['amount' => '11.00']);
            }

            return ['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000];
        });
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertSame('payment_requires_reconciliation', app(ExistingReservationPaymentCycleRegistry::class)->open($order->stays_reservation_id, $order->id, 'second-cycle-12345678', null, app(ExistingReservationPaymentCycleRegistry::class)->prepare($order->stays_reservation_id))['status']);
    }

    #[DataProvider('thirdSettlementOutcomes')]
    public function test_three_partial_cycles_use_current_balance_and_historical_readbacks_in_isolated_sqlite(bool $financeMismatch): void
    {
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        // Use the real migrated schema and exercise historical order rows.
        [$first, $firstAttempt, $firstCycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $audit = $this->mock(ExistingReservationLedgerAudit::class);
        $audit->shouldReceive('inspect')->once()->andReturn(['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000]);
        $this->assertTrue(app(ExperimentalExistingCycleSettlement::class)->close($first));

        $second = $first->replicate(['website_stays_reservation_id']);
        $second->idempotency_key = 'isolated-second-order-123456';
        $second->quote_total = '6.00';
        $snapshot = $first->quote_snapshot['existing_reservation'];
        $snapshot['payment_id'] = str_repeat('d', 24);
        $snapshot['pending_amount_cents'] = 600;
        $snapshot['reported_paid_cents'] = 1000;
        $second->quote_snapshot = ['existing_reservation' => $snapshot];
        $second->save();
        $secondAttempt = $firstAttempt->replicate();
        $secondAttempt->direct_booking_order_id = $second->id;
        $secondAttempt->idempotency_key = 'isolated-second-attempt-123456';
        $secondAttempt->amount = '6.00';
        $secondAttempt->gateway_payment_id = 'second-gateway-id';
        $secondAttempt->save();
        $service = app(ExperimentalExistingCycleSettlement::class);
        $hash = (new \ReflectionMethod($service, 'attemptHash'))->invoke($service, $secondAttempt->fresh());
        $oldAction = $first->staysActions()->first();
        $secondAction = $oldAction->replicate();
        $secondAction->direct_booking_order_id = $second->id;
        $secondAction->idempotency_key = 'isolated-second-action-123456';
        $secondAction->external_id = $snapshot['payment_id'];
        $request = $oldAction->request_snapshot;
        $request['attempt_id'] = $secondAttempt->id;
        $request['attempt_hash'] = $hash;
        $request['payment_id'] = $snapshot['payment_id'];
        $request['amount_cents'] = 600;
        $request['marker'] = 'CRCN_SETTLEMENT:'.str_repeat('y', 32);
        $secondAction->request_snapshot = $request;
        $secondAction->response_snapshot = ['payment_id' => $snapshot['payment_id'], 'status' => 'completed', 'payment_date' => $request['payment_date']];
        $secondAction->save();
        DB::table('existing_reservation_payment_cycles')->insert(['id' => (string) Str::uuid(),
            'stays_reservation_id' => $snapshot['_id'], 'active_reservation_id' => $snapshot['_id'], 'direct_booking_order_id' => $second->id,
            'direct_booking_payment_attempt_id' => $secondAttempt->id, 'idempotency_key' => 'isolated-second-cycle-123456',
            'state' => 'open', 'created_at' => now(), 'updated_at' => now()]);
        $this->app->forgetInstance(StaysExternalApiClient::class);
        $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->zeroOrMoreTimes()->andReturnUsing(function (string $path) use ($first, $second) {
            $this->assertSame(0, DB::transactionLevel());
            $rows = [];
            foreach ([$first, $second] as $order) {
                $snap = $order->quote_snapshot['existing_reservation'];
                $request = $order->staysActions()->first()->request_snapshot;
                if (str_contains($path, '/finance/') && str_ends_with($path, $snap['payment_id'])) {
                    return ['_id' => $snap['payment_id'], 'reserveId' => $snap['_id'], 'type' => 'credit', 'paid' => true,
                        'bankAccountId' => $snap['pending_provider_id'], 'payment' => ['paymentDate' => $request['payment_date']], '_mcval' => ['BRL' => $snap['pending_amount_cents'] / 100]];
                }
                $rows[] = ['_id' => $snap['payment_id'], 'type' => 'credit', 'status' => 'completed', 'paymentDate' => $request['payment_date'],
                    '_idpaymentProvider' => $snap['pending_provider_id'], '_f_val' => $snap['pending_amount_cents'] / 100, 'desc' => $request['marker']];
            }

            return $rows;
        });
        $audit->shouldReceive('inspect')->once()->andReturn(['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1600, 'balance_cents' => 400]);
        $this->assertTrue($service->close($second));

        $third = $second->replicate(['website_stays_reservation_id']);
        $third->idempotency_key = 'isolated-third-order-123456';
        $third->quote_total = '4.00';
        $thirdSnapshot = $snapshot;
        $thirdSnapshot['pending_amount_cents'] = 400;
        $thirdSnapshot['reported_paid_cents'] = 1600;
        $thirdSnapshot['payment_id'] = str_repeat('e', 24);
        $thirdSnapshot['_idclient'] = 'client';
        $thirdSnapshot['_idlisting'] = 'listing';
        $thirdSnapshot['checkInDate'] = '2030-11-13';
        $thirdSnapshot['checkOutDate'] = '2030-11-16';
        $thirdSnapshot['guests'] = 1;
        $thirdSnapshot['channel_provider_ids'] = ['pix' => $snapshot['pending_provider_id']];
        $third->quote_snapshot = ['existing_reservation' => $thirdSnapshot];
        $third->payment_status = null;
        $third->gateway_provider = 'cielo_sandbox';
        $third->gateway_merchant_id = 'test-merchant';
        $third->reservation_status = 'booked';
        $third->expires_at = now()->addHour();
        $third->save();
        $audit->shouldReceive('inspect')->twice()->andReturn(['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1600, 'balance_cents' => 400,
            'pending_payment_id' => str_repeat('e', 24), 'pending_provider_id' => str_repeat('f', 24), 'pending_cents' => 400]);
        $audit->shouldReceive('confirmsSnapshot')->zeroOrMoreTimes()->andReturnTrue();
        config(['direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true,
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => true, 'direct-booking.resume_token_ttl_days' => 2,
            'direct-booking.stays_payment_type' => 'credit', 'direct-booking.stays_payment_provider_id' => 'test-provider',
            'direct-booking.notification_queue_connection' => 'database', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'services.cielo.direct_environment' => 'sandbox', 'services.cielo.enabled' => true, 'services.cielo.pix_enabled' => true,
            'services.cielo.merchant_id' => 'test-merchant', 'services.cielo.merchant_key' => 'test-key']);
        $this->mock(ExistingReservationPaymentChannels::class)->shouldReceive('verifiedProvider')->andReturn($snapshot['pending_provider_id']);
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->once()->andReturnTrue();
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->andReturn(['canonical' => $snapshot['_id'], 'code' => 'ZY92K']);
        $input = $this->mock(StoreCheckoutPaymentRequest::class);
        $input->shouldReceive('validated')->andReturn(['idempotencyKey' => 'isolated-third-payment-123456', 'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
            'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']]);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            $this->assertSame(0, DB::transactionLevel());

            return Http::response(['MerchantOrderId' => $request['MerchantOrderId'], 'Payment' => ['PaymentId' => '123e4567-e89b-12d3-a456-426614174080',
                'Type' => 'Pix', 'Status' => 2, 'Amount' => 400, 'Currency' => 'BRL', 'CapturedDate' => now()->toIso8601String(), 'ExpirationDate' => now()->addMinutes(30)->toIso8601String(),
                'QrCodeString' => 'synthetic-pix-code', 'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic")]], 201);
        });
        $result = app(CieloCheckoutPaymentService::class)->createAttempt($third, $input);
        $this->assertSame('approved', $result['attempt']?->status, $result['code']);
        $this->assertSame('4.00', $result['attempt']?->amount);
        $third->refresh();
        $completed = false;
        $description = null;
        $date = $result['attempt']->paid_at->setTimezone('America/Sao_Paulo')->toDateString();
        $reservation = ['_id' => $snapshot['_id'], '_idclient' => 'client', '_idlisting' => 'listing',
            'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 1, 'type' => 'booked',
            'price' => ['currency' => 'BRL', '_f_total' => 20], 'stats' => ['_f_totalPaid' => 16], 'partner' => ['name' => 'API booking.com']];
        $this->app->forgetInstance(StaysExternalApiClient::class);
        $stays = $this->mock(StaysExternalApiClient::class);
        $stays->shouldReceive('get')->zeroOrMoreTimes()->andReturnUsing(function (string $path) use ($thirdSnapshot, $reservation, $financeMismatch, $date, &$completed, &$description) {
            $this->assertSame(0, DB::transactionLevel());
            if (str_contains($path, '/finance/')) {
                return ['_id' => $thirdSnapshot['payment_id'], 'reserveId' => $thirdSnapshot['_id'], 'type' => 'credit', 'paid' => $completed && ! $financeMismatch,
                    'bankAccountId' => $thirdSnapshot['pending_provider_id'], 'payment' => ['paymentDate' => $date], '_mcval' => ['BRL' => 4]];
            }
            if (str_ends_with($path, '/payments')) {
                return [['_id' => $thirdSnapshot['payment_id'], '_idpaymentProvider' => $thirdSnapshot['pending_provider_id'], 'type' => 'credit',
                    'status' => $completed ? 'completed' : 'pending', '_f_val' => 4, 'name' => 'Pagamento da reserva',
                    ...($completed ? ['paymentDate' => $date, 'desc' => $description] : [])]];
            }

            return $reservation;
        });
        $stays->shouldReceive('request')->once()->andReturnUsing(function ($method, $path, $query = [], $payload = []) use (&$completed, &$description) {
            $this->assertSame(0, DB::transactionLevel());
            $completed = true;
            $description = $payload['desc'];

            return null;
        });
        if (! $financeMismatch) {
            $audit->shouldReceive('inspect')->once()->andReturn(['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 2000, 'balance_cents' => 0]);
        }
        $settlement = app(ExistingReservationSettlement::class)->settle($third);
        $this->assertSame(! $financeMismatch, $settlement['ready']);
        $this->assertDatabaseHas('direct_booking_stays_actions', ['direct_booking_order_id' => $third->id,
            'action_type' => 'settle_existing_receivable', 'status' => $financeMismatch ? 'attention_required' : 'succeeded']);
    }

    public static function thirdSettlementOutcomes(): array
    {
        return ['confirmed in both views' => [false], 'finance does not confirm' => [true]];
    }

    public function test_experimental_settlement_rejects_finance_not_paid(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture('finance_unpaid');
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->once()->andReturn([
            'status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000,
        ]);
        $this->assertFalse(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle, 'state' => 'open']);
    }

    public function test_experimental_settlement_rejects_changed_attempt_during_audit(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->once()->andReturnUsing(function () use ($attempt) {
            $attempt->update(['status' => 'refunded']);

            return ['status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000];
        });
        $this->assertFalse(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle, 'state' => 'open']);
    }

    public function test_experimental_settlement_rejects_unverified_or_inconsistent_balance(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        $this->assertFalse(app(ExperimentalExistingCycleSettlement::class)->close($order));
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->once()->andReturn(['status' => 'review_required']);
        $this->assertFalse(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle, 'state' => 'open']);
    }

    public function test_experimental_settlement_rejects_mismatched_response(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture();
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $order->staysActions()->first()->update(['response_snapshot' => ['status' => 'completed', 'payment_id' => str_repeat('c', 24)]]);
        $this->assertFalse(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle, 'state' => 'open']);
    }

    public function test_experimental_settlement_rejects_changed_marker_despite_matching_totals(): void
    {
        [$order, $attempt, $cycle] = $this->settledFixture('changed_marker');
        config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('inspect')->once()->andReturn([
            'status' => 'consistent_candidate', 'total_cents' => 2000, 'paid_cents' => 1000, 'balance_cents' => 1000,
        ]);
        $this->assertFalse(app(ExperimentalExistingCycleSettlement::class)->close($order));
        $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle, 'state' => 'open']);
    }

    private function settledFixture(string $mode = 'normal'): array
    {
        $id = str_repeat('a', 24);
        $order = $this->order($id);
        $snapshot = ['_id' => $id, 'reservation_code' => 'ZY92K', 'reservation_total_cents' => 2000,
            'pending_amount_cents' => 1000, 'reported_paid_present' => true, 'reported_paid_cents' => 0, 'payment_id' => str_repeat('b', 24), 'pending_provider_id' => str_repeat('f', 24)];
        $order->update(['payment_status' => 'approved', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'quote_snapshot' => ['existing_reservation' => $snapshot]]);
        $registry = app(ExistingReservationPaymentCycleRegistry::class);
        $cycle = $registry->open($id, $order->id, 'fixture-cycle-12345678')['cycle_id'];
        $attempt = $order->paymentAttempts()->create(['idempotency_key' => 'fixture-attempt-12345678', 'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'processing', 'amount' => '10.00', 'currency' => 'BRL']);
        app(ExistingReservationPaymentLock::class)->synchronized($id, fn () => $registry->bindAttempt($cycle, $order, $attempt));
        $attempt->update(['status' => 'approved', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'gateway_payment_id' => 'payment', 'paid_at' => now()]);
        $service = app(ExperimentalExistingCycleSettlement::class);
        $hash = (new \ReflectionMethod($service, 'attemptHash'))->invoke($service, $attempt->fresh());
        $order->staysActions()->create(['action_type' => 'settle_existing_receivable', 'status' => 'succeeded',
            'idempotency_key' => 'fixture-action-12345678', 'external_id' => $snapshot['payment_id'], 'attempt_count' => 1,
            'request_snapshot' => ['write_started' => true, 'attempt_id' => $attempt->id, 'payment_id' => $snapshot['payment_id'],
                'amount_cents' => 1000, 'attempt_hash' => $hash, 'marker' => 'CRCN_SETTLEMENT:'.str_repeat('x', 32),
                'original_desc_hash' => hash('sha256', ''), 'provider_id' => str_repeat('f', 24),
                'payment_date' => $attempt->fresh()->paid_at->setTimezone('America/Sao_Paulo')->toDateString()],
            'response_snapshot' => ['payment_id' => $snapshot['payment_id'], 'status' => 'completed',
                'payment_date' => $attempt->fresh()->paid_at->setTimezone('America/Sao_Paulo')->toDateString()]]);
        $paymentDate = $attempt->fresh()->paid_at->setTimezone('America/Sao_Paulo')->toDateString();
        $this->mock(StaysExternalApiClient::class)->shouldReceive('get')->zeroOrMoreTimes()->andReturnUsing(function (string $path) use ($snapshot, $paymentDate, $mode) {
            if (str_contains($path, '/finance/')) {
                return ['_id' => $snapshot['payment_id'], 'reserveId' => $snapshot['_id'], 'type' => 'credit', 'paid' => $mode !== 'finance_unpaid',
                    'bankAccountId' => $snapshot['pending_provider_id'], 'payment' => ['paymentDate' => $paymentDate], '_mcval' => ['BRL' => 10]];
            }

            return [['_id' => $snapshot['payment_id'], 'type' => 'credit', 'status' => 'completed', 'paymentDate' => $paymentDate,
                '_idpaymentProvider' => $snapshot['pending_provider_id'], '_f_val' => 10, 'desc' => 'CRCN_SETTLEMENT:'.str_repeat($mode === 'changed_marker' ? 'y' : 'x', 32)]];
        });

        return [$order->fresh(), $attempt->fresh(), $cycle];
    }

    private function order(string $reservationId): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'order-'.$reservationId,
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing',
            'stays_reservation_id' => $reservationId, 'check_in' => '2026-11-13', 'check_out' => '2026-11-16',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Teste',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00',
            'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test',
            'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'operational_events' => [],
        ]);
    }
}
