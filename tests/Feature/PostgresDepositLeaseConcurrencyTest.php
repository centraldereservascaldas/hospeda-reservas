<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresDepositLeaseConcurrencyTest extends TestCase
{
    public function test_workers_do_not_share_a_live_lease_and_expired_lease_can_be_reclaimed(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql' || DB::connection()->getDatabaseName() !== 'hospeda_test'
            || ! app()->environment('testing') || ! $this->hasIsolatedHost()) {
            $this->markTestSkipped('Requires isolated PostgreSQL over a temporary Unix socket.');
        }
        $this->assertTrue(function_exists('proc_open'));
        $this->artisan('migrate')->assertSuccessful();
        $this->assertSame(0, DB::table('direct_booking_orders')->count(), 'Run this concurrency test against an empty isolated database.');
        $reservation = bin2hex(random_bytes(12));
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::EntradaConciliada, 'payment_status' => 'approved', 'reservation_status' => 'reserved',
            'idempotency_key' => 'lease-'.$reservation, 'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing',
            'stays_listing_id' => 'listing', 'stays_reservation_id' => $reservation, 'check_in' => '2030-11-13', 'check_out' => '2030-11-16',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Teste',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00', 'currency' => 'BRL',
            'quote_snapshot' => [], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'operational_events' => [], 'deposit_verification_due_at' => now()->subMinute(),
        ]);
        $worker = <<<'WORKER'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || !(str_starts_with((string) config('database.connections.pgsql.host'), '/private/tmp/')
        || str_starts_with((string) config('database.connections.pgsql.host'), '/tmp/')
        || (getenv('GITHUB_ACTIONS') === 'true' && config('database.connections.pgsql.host') === '127.0.0.1'
            && config('database.connections.pgsql.username') === 'hospeda_test'))) { exit(2); }
config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
'direct-booking.confirmation_enabled' => true, 'direct-booking.experimental_existing_deposit_enabled' => true,
'direct-booking.experimental_existing_cycle_settlement_enabled' => true, 'direct-booking.experimental_existing_ledger_audit_enabled' => true]);
Illuminate\Support\Facades\Http::preventStrayRequests();
$mock = Mockery::mock(App\Services\DirectStaysPaymentService::class);
$mock->shouldReceive('confirmPaidReservation')->andReturnUsing(function () { fwrite(STDOUT, "claimed\n"); fflush(STDOUT); fgets(STDIN); return ['ready' => true, 'code' => 'verified', 'message' => 'ok']; });
$app->instance(App\Services\DirectStaysPaymentService::class, $mock);
fwrite(STDOUT, "ready\n"); fflush(STDOUT);
if (trim((string) fgets(STDIN)) !== 'go') { exit(3); }
$result = app(App\Services\DirectStaysReservationService::class)->recover();
fwrite(STDOUT, json_encode($result)."\n"); fflush(STDOUT);
WORKER;
        $env = array_merge($_ENV, ['APP_ENV' => 'testing', 'APP_KEY' => 'base64:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=', 'DB_CONNECTION' => 'pgsql', 'DB_URL' => '', 'DB_HOST' => config('database.connections.pgsql.host'), 'DB_PORT' => (string) config('database.connections.pgsql.port'), 'DB_DATABASE' => 'hospeda_test', 'DB_USERNAME' => config('database.connections.pgsql.username'), 'DB_PASSWORD' => (string) config('database.connections.pgsql.password'), 'CACHE_STORE' => 'array', 'QUEUE_CONNECTION' => 'sync']);
        $env['GITHUB_ACTIONS'] = (string) getenv('GITHUB_ACTIONS');
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'a']];
        $a = $b = null;
        $pa = $pb = [];
        try {
            $a = proc_open([PHP_BINARY, '-r', $worker], $spec, $pa, base_path(), $env);
            $b = proc_open([PHP_BINARY, '-r', $worker], $spec, $pb, base_path(), $env);
            $this->assertIsResource($a);
            $this->assertIsResource($b);
            $this->assertTrue($this->hasOutput($pa[1], 15));
            $this->assertSame("ready\n", fgets($pa[1]));
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $this->assertSame("ready\n", fgets($pb[1]));
            fwrite($pa[0], "go\n");
            fwrite($pb[0], "go\n");
            fflush($pa[0]);
            fflush($pb[0]);
            $this->assertTrue($this->hasOutput($pa[1], 15));
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $first = fgets($pa[1]);
            $second = fgets($pb[1]);
            if ($second === "claimed\n") {
                [$a, $b] = [$b, $a];
                [$pa, $pb] = [$pb, $pa];
                [$first, $second] = [$second, $first];
            }
            $this->assertSame("claimed\n", $first);
            $this->assertSame(['processed' => 0, 'attention' => 0], json_decode($second, true));
            foreach ($pb as $pipe) {
                fclose($pipe);
            }
            $pb = [];
            $this->stopProcess($b);
            $b = null;
            DB::table('direct_booking_orders')->where('id', $order->id)->update(['deposit_verification_lease_until' => now()->subSecond()]);
            $pb = [];
            $b = proc_open([PHP_BINARY, '-r', $worker], $spec, $pb, base_path(), $env);
            $this->assertIsResource($b);
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $this->assertSame("ready\n", fgets($pb[1]));
            fwrite($pb[0], "go\n");
            fflush($pb[0]);
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $this->assertSame("claimed\n", fgets($pb[1]));
            $secondToken = DB::table('direct_booking_orders')->where('id', $order->id)->value('deposit_verification_lease_token');
            fwrite($pa[0], "release\n");
            fflush($pa[0]);
            $this->assertTrue($this->hasOutput($pa[1], 15));
            $this->assertSame(['processed' => 1, 'attention' => 0], json_decode(fgets($pa[1]), true));
            $this->assertSame($secondToken, DB::table('direct_booking_orders')->where('id', $order->id)->value('deposit_verification_lease_token'));
            fwrite($pb[0], "release\n");
            fflush($pb[0]);
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $this->assertSame(['processed' => 1, 'attention' => 0], json_decode(fgets($pb[1]), true));
            $this->assertNull(DB::table('direct_booking_orders')->where('id', $order->id)->value('deposit_verification_lease_token'));
        } finally {
            foreach ([$pa, $pb] as $pipes) {
                foreach ($pipes as $pipe) {
                    if (is_resource($pipe)) {
                        fclose($pipe);
                    }
                }
            }
            foreach ([$a, $b] as $process) {
                if (is_resource($process)) {
                    $this->stopProcess($process);
                }
            }
            $order->delete();
        }
    }

    private function stopProcess($process): void
    {
        if (proc_get_status($process)['running']) {
            proc_terminate($process, 9);
        }
        proc_close($process);
    }

    private function hasOutput($stream, int $seconds): bool
    {
        $read = [$stream];
        $write = null;
        $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }

    private function hasIsolatedHost(): bool
    {
        $host = (string) config('database.connections.pgsql.host');

        return str_starts_with($host, '/private/tmp/') || str_starts_with($host, '/tmp/')
            || (getenv('GITHUB_ACTIONS') === 'true' && $host === '127.0.0.1'
                && config('database.connections.pgsql.username') === 'hospeda_test');
    }
}
