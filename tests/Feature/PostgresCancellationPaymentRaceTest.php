<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresCancellationPaymentRaceTest extends TestCase
{
    public function test_cancellation_claim_blocks_a_concurrent_payment_decision(): void
    {
        $this->runRace('cancel');
    }

    public function test_payment_order_blocks_a_concurrent_cancellation_claim(): void
    {
        $this->runRace('payment');
    }

    private function runRace(string $winner): void
    {
        if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true'
            || DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires the isolated GitHub Actions PostgreSQL service.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        $this->assertSame('127.0.0.1', config('database.connections.pgsql.host'));
        $this->assertSame('5432', (string) config('database.connections.pgsql.port'));
        $this->assertSame('hospeda_test', config('database.connections.pgsql.username'));
        $this->assertSame('ci-only-password', config('database.connections.pgsql.password'));
        $this->assertTrue(function_exists('proc_open'));
        $this->artisan('migrate')->assertSuccessful();

        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || config('database.connections.pgsql.host') !== '127.0.0.1'
    || config('database.connections.pgsql.username') !== 'hospeda_test'
    || config('database.connections.pgsql.password') !== 'ci-only-password') {
    throw new RuntimeException('Unsafe worker environment');
}
$id = $argv[1];
$kind = $argv[2];
fwrite(STDOUT, "ready\n"); fflush(STDOUT);
$result = app(App\Services\ExistingReservationPaymentLock::class)->synchronized($id, function (string $id) use ($kind, $argv) {
    $guard = app(App\Services\ReservationReleaseGuard::class);
    if ($kind === 'cancel') {
        $accepted = $guard->claimGuestCancellation(['canonical' => $id, 'code' => 'ZY92K']);
    } else {
        $accepted = ! $guard->paymentBlocked($id, 'ZY92K');
        if ($accepted) {
            App\Models\DirectBookingOrder::query()->create([
                'status' => App\Enums\DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'race-'.$id,
                'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing',
                'stays_reservation_id' => $id, 'check_in' => '2026-11-13', 'check_out' => '2026-11-16',
                'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Teste',
                'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00',
                'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test',
                'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'operational_events' => [],
            ]);
        }
    }
    fwrite(STDOUT, ($accepted ? 'accepted' : 'blocked')."\n"); fflush(STDOUT);
    if ($argv[3] === 'hold') { fgets(STDIN); }
    return $accepted;
});
PHP;
        $id = bin2hex(random_bytes(12));
        $env = ['CI' => 'true', 'GITHUB_ACTIONS' => 'true', 'APP_ENV' => 'testing',
            'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'DB_CONNECTION' => 'pgsql',
            'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432', 'DB_DATABASE' => 'hospeda_test',
            'DB_USERNAME' => 'hospeda_test', 'DB_PASSWORD' => 'ci-only-password', 'DB_URL' => '',
            'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'];
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $a = $b = null;
        $pipesA = $pipesB = [];
        try {
            $a = proc_open([PHP_BINARY, '-r', $worker, $id, $winner, 'hold'], $spec, $pipesA, base_path(), $env);
            $this->assertIsResource($a);
            $this->assertTrue($this->hasOutput($pipesA[1], 10));
            $this->assertSame("ready\n", fgets($pipesA[1]));
            $this->assertTrue($this->hasOutput($pipesA[1], 10));
            $this->assertSame("accepted\n", fgets($pipesA[1]));
            $loser = $winner === 'cancel' ? 'payment' : 'cancel';
            $b = proc_open([PHP_BINARY, '-r', $worker, strtoupper($id), $loser, 'run'], $spec, $pipesB, base_path(), $env);
            $this->assertIsResource($b);
            $this->assertTrue($this->hasOutput($pipesB[1], 10));
            $this->assertSame("ready\n", fgets($pipesB[1]));
            $this->assertFalse($this->hasOutput($pipesB[1], 1), 'Competing decision completed before commit.');
            fwrite($pipesA[0], "commit\n"); fflush($pipesA[0]);
            $this->assertTrue($this->hasOutput($pipesB[1], 10), 'Competing decision did not finish after commit.');
            $this->assertSame("blocked\n", fgets($pipesB[1]));
            $row = DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $id)->first();
            $this->assertSame($winner === 'cancel', $row->guest_cancel_claimed_at !== null);
            $this->assertSame($winner === 'payment' ? 1 : 0, DB::table('direct_booking_orders')->where('stays_reservation_id', $id)->count());
        } finally {
            foreach ([$pipesA, $pipesB] as $pipes) {
                foreach ($pipes as $pipe) { if (is_resource($pipe)) { fclose($pipe); } }
            }
            foreach ([$a, $b] as $process) {
                if (is_resource($process)) { proc_terminate($process); proc_close($process); }
            }
            DB::table('direct_booking_orders')->where('stays_reservation_id', $id)->delete();
            DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $id)->delete();
        }
    }

    private function hasOutput($stream, int $seconds): bool
    {
        $read = [$stream]; $write = null; $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }
}
