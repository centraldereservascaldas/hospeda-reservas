<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ExistingReservationConcurrentClaimsTest extends TestCase
{
    public function test_competing_workers_open_only_one_cycle_for_a_reservation(): void
    {
        if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true') {
            $this->markTestSkipped('Requires the isolated Linux GitHub Actions PostgreSQL service.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        $this->assertSame('127.0.0.1', config('database.connections.pgsql.host'));
        $this->assertSame('5432', (string) config('database.connections.pgsql.port'));
        $this->assertSame('hospeda_test', config('database.connections.pgsql.username'));
        $this->assertSame('ci-only-password', config('database.connections.pgsql.password'));
        $this->assertTrue(function_exists('proc_open'));
        $this->artisan('migrate')->assertSuccessful();

        $reservation = bin2hex(random_bytes(12));
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'order-'.$reservation,
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing',
            'stays_reservation_id' => $reservation, 'check_in' => '2026-11-13', 'check_out' => '2026-11-16',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Teste',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00',
            'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test',
            'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'operational_events' => [],
        ]);

        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true'
    || ! app()->environment('testing')
    || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || config('database.connections.pgsql.host') !== '127.0.0.1'
    || (string) config('database.connections.pgsql.port') !== '5432'
    || config('database.connections.pgsql.username') !== 'hospeda_test'
    || config('database.connections.pgsql.password') !== 'ci-only-password') {
    fwrite(STDERR, "Unsafe worker environment.\n");
    exit(1);
}
$registry = app(App\Services\ExistingReservationPaymentCycleRegistry::class);
if ($argv[4] === 'first') {
    app(App\Services\ExistingReservationPaymentLock::class)->synchronized($argv[1], function () use ($registry, $argv) {
        $result = $registry->open($argv[1], $argv[2], $argv[3]);
        fwrite(STDOUT, json_encode($result)."\n");
        fflush(STDOUT);
        fgets(STDIN);
    });
} else {
    fwrite(STDOUT, "ready\n");
    fflush(STDOUT);
    $result = $registry->open(strtoupper($argv[1]), $argv[2], $argv[3]);
    fwrite(STDOUT, json_encode($result)."\n");
    fflush(STDOUT);
}
PHP;
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $environment = [
            'CI' => 'true', 'GITHUB_ACTIONS' => 'true', 'APP_ENV' => 'testing',
            'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'DB_CONNECTION' => 'pgsql', 'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432',
            'DB_DATABASE' => 'hospeda_test', 'DB_USERNAME' => 'hospeda_test', 'DB_PASSWORD' => 'ci-only-password',
            'DB_URL' => '', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync',
        ];
        $pipesA = [];
        $pipesB = [];
        $a = null;
        $b = null;
        try {
            $a = proc_open([PHP_BINARY, '-r', $worker, $reservation, $order->id, 'first-claim-'.$reservation, 'first'], $spec, $pipesA, base_path(), $environment);
            $this->assertIsResource($a);
            $this->assertTrue($this->workerHasOutput($pipesA[1], 10), 'First worker did not claim the cycle.');
            $first = json_decode(fgets($pipesA[1]), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame('opened', $first['status']);

            $b = proc_open([PHP_BINARY, '-r', $worker, $reservation, $order->id, 'second-claim-'.$reservation, 'second'], $spec, $pipesB, base_path(), $environment);
            $this->assertIsResource($b);
            $this->assertTrue($this->workerHasOutput($pipesB[1], 10), 'Second worker did not start.');
            $this->assertSame("ready\n", fgets($pipesB[1]));
            $this->assertFalse($this->workerHasOutput($pipesB[1], 1), 'Second claim completed before the first transaction committed.');
            fwrite($pipesA[0], "commit\n");
            fflush($pipesA[0]);
            $this->assertTrue($this->workerHasOutput($pipesB[1], 10), 'Second claim did not finish after commit.');
            $second = json_decode(fgets($pipesB[1]), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame(['status' => 'cycle_in_progress', 'cycle_id' => null], $second);
            $cycles = DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $reservation)->get();
            $this->assertCount(1, $cycles);
            $this->assertSame($first['cycle_id'], $cycles[0]->id);
            $this->assertSame($reservation, $cycles[0]->active_reservation_id);
        } finally {
            foreach ([$pipesA, $pipesB] as $pipes) {
                foreach ($pipes as $pipe) {
                    if (is_resource($pipe)) {
                        fclose($pipe);
                    }
                }
            }
            foreach ([$a, $b] as $process) {
                if (is_resource($process)) {
                    proc_terminate($process);
                    proc_close($process);
                }
            }
            DB::table('existing_reservation_payment_cycles')->where('stays_reservation_id', $reservation)->delete();
            DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $reservation)->delete();
            $order->delete();
        }
    }

    private function workerHasOutput($stream, int $seconds): bool
    {
        $read = [$stream];
        $write = null;
        $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }
}
