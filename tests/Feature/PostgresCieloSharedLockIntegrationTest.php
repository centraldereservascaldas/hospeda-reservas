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
use App\Services\Payments\CieloCheckoutPaymentService;
use App\Services\StaysReservationIdentity;
use Closure;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PostgresCieloSharedLockIntegrationTest extends TestCase
{
    public function test_cielo_claim_reenters_shared_lock_and_commits_before_gateway(): void
    {
        if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true'
            || DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires the isolated Linux GitHub Actions PostgreSQL service.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        $this->assertSame('127.0.0.1', config('database.connections.pgsql.host'));
        $this->assertSame('5432', (string) config('database.connections.pgsql.port'));
        $this->assertSame('hospeda_test', config('database.connections.pgsql.username'));
        $this->assertSame('ci-only-password', config('database.connections.pgsql.password'));
        $this->artisan('migrate')->assertSuccessful();

        $reservation = bin2hex(random_bytes(12));
        $provider = str_repeat('f', 24);
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'order-'.$reservation,
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing',
            'stays_reservation_id' => $reservation, 'check_in' => '2030-11-13', 'check_out' => '2030-11-16',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Teste',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00',
            'currency' => 'BRL', 'quote_snapshot' => ['existing_reservation' => ['channel_provider_ids' => ['pix' => $provider], 'pending_provider_id' => $provider]],
            'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(),
            'origin' => 'stays_existing', 'operational_events' => [], 'gateway_provider' => 'cielo_sandbox',
            'gateway_merchant_id' => 'test-merchant', 'reservation_status' => 'booked', 'expires_at' => now()->addHours(4),
        ]);
        config(['direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.confirmation_enabled' => true,
            'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.experimental_existing_cycle_settlement_enabled' => false,
            'direct-booking.experimental_existing_ledger_audit_enabled' => true, 'direct-booking.resume_token_ttl_days' => 2,
            'direct-booking.stays_payment_type' => 'credit', 'direct-booking.stays_payment_provider_id' => 'test-provider',
            'direct-booking.notification_queue_connection' => 'database', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'services.cielo.direct_environment' => 'sandbox', 'services.cielo.enabled' => true, 'services.cielo.pix_enabled' => true,
            'services.cielo.merchant_id' => 'test-merchant', 'services.cielo.merchant_key' => 'test-key']);
        $this->mock(ExistingReservationPaymentChannels::class)->shouldReceive('verifiedProvider')->andReturn($provider);
        $this->mock(ExistingReservationLedgerAudit::class)->shouldReceive('confirmsSnapshot')->andReturnTrue();
        $this->mock(DirectStaysReservationService::class)->shouldReceive('validateReservedOrderForPayment')->andReturnTrue();
        $this->mock(StaysReservationIdentity::class)->shouldReceive('resolve')->andReturn(['canonical' => $reservation, 'code' => 'ZY92K']);
        $lock = new class extends ExistingReservationPaymentLock
        {
            public int $depth = 0;

            public int $maxDepth = 0;

            protected function sharedProtocolEnabled(): bool
            {
                return true;
            }

            public function synchronized(string $reservationId, Closure $callback): mixed
            {
                $this->depth++;
                $this->maxDepth = max($this->maxDepth, $this->depth);
                try {
                    return parent::synchronized($reservationId, $callback);
                } finally {
                    $this->depth--;
                }
            }
        };
        $this->app->instance(ExistingReservationPaymentLock::class, $lock);
        $sharedQueries = 0;
        DB::listen(function ($query) use (&$sharedQueries) {
            if (str_contains(strtolower($query->sql), 'for share') && str_contains($query->sql, 'existing_reservation_payment_locks')) {
                $sharedQueries++;
            }
        });
        $input = $this->mock(StoreCheckoutPaymentRequest::class);
        $input->shouldReceive('validated')->andReturn(['idempotencyKey' => 'payment-'.$reservation, 'paymentMethod' => 'pix', 'paymentMethodId' => 'pix',
            'payerIdentification' => ['type' => 'CPF', 'number' => '12345678901']]);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($reservation, $order) {
            $this->assertSame(0, DB::transactionLevel());
            $cycle = DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $reservation)->first();
            $this->assertNotNull($cycle);
            $this->assertNotNull($cycle->direct_booking_payment_attempt_id);
            $this->assertSame(['status' => 'cycle_in_progress', 'cycle_id' => null], app(ExistingReservationPaymentCycleRegistry::class)->open($reservation, $order->id, 'competitor-'.$reservation));

            return Http::response(['MerchantOrderId' => $request['MerchantOrderId'], 'Payment' => ['PaymentId' => '123e4567-e89b-12d3-a456-426614174080',
                'Type' => 'Pix', 'Status' => 1, 'Amount' => 1000, 'Currency' => 'BRL', 'ExpirationDate' => now()->addMinutes(30)->toIso8601String(),
                'QrCodeString' => 'synthetic-pix-code', 'QrCodeBase64Image' => base64_encode("\x89PNG\r\n\x1a\nsynthetic")]], 201);
        });
        try {
            $service = app(CieloCheckoutPaymentService::class);
            $result = $service->createAttempt($order, $input);
            $this->assertNotNull($result['attempt'], $result['code']);
            $this->assertGreaterThanOrEqual(2, $lock->maxDepth, 'Registry must reenter the service reservation lock.');
            $this->assertGreaterThan(0, $sharedQueries, 'PostgreSQL shared protocol must be exercised.');
            $cycle = DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $reservation)->sole();
            $this->assertSame($result['attempt']->id, $cycle->direct_booking_payment_attempt_id);
            $this->assertSame($reservation, $cycle->active_reservation_id);
            $replay = $service->createAttempt($order->fresh(), $input);
            $this->assertTrue($replay['replayed']);
            $this->assertSame($result['attempt']->id, $replay['attempt']->id);
            Http::assertSentCount(1);
        } finally {
            DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $reservation)->delete();
            $order->paymentAttempts()->delete();
            $order->delete();
            DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $reservation)->delete();
        }
    }
}
