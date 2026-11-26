<?php

namespace Tests\Feature;

use App\Models\PartnerCheckoutOrder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresPartnerReservationConcurrencyTest extends TestCase
{
    public function test_simultaneous_workers_only_submit_one_supplier_request(): void
    {
        $host = (string) config('database.connections.pgsql.host');
        if (DB::connection()->getDriverName() !== 'pgsql' || DB::connection()->getDatabaseName() !== 'hospeda_test'
            || ! app()->environment('testing') || ! (str_starts_with($host, '/tmp/') || str_starts_with($host, '/private/tmp/')
                || (getenv('GITHUB_ACTIONS') === 'true' && $host === '127.0.0.1' && config('database.connections.pgsql.username') === 'hospeda_test'))) {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue(function_exists('proc_open'));
        $this->artisan('migrate')->assertSuccessful();
        $unique = bin2hex(random_bytes(12));
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('X', 16).$unique, 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2030-05-17', 'check_out' => '2030-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_verified', 'payment_id' => 'PAY-'.$unique, 'merchant_order_id' => 'M-'.$unique, 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-'.$unique, 'encrypted_customer' => ['fullName' => 'Teste']]);
        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$host = (string) config('database.connections.pgsql.host');
if (!app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || !(str_starts_with($host, '/tmp/') || str_starts_with($host, '/private/tmp/')
        || (getenv('GITHUB_ACTIONS') === 'true' && $host === '127.0.0.1' && config('database.connections.pgsql.username') === 'hospeda_test'))) exit(2);
config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
Illuminate\Support\Facades\Http::preventStrayRequests();
$mock = Mockery::mock(App\Services\ImobSysPreReservationClient::class);
$mock->shouldReceive('create')->andReturnUsing(function () {
    fwrite(STDOUT, "supplier-called\n"); fflush(STDOUT); fgets(STDIN);
    return ['id' => '1600'];
});
$app->instance(App\Services\ImobSysPreReservationClient::class, $mock);
fwrite(STDOUT, "ready\n"); fflush(STDOUT); fgets(STDIN);
try { app(App\Services\PartnerPaidReservationService::class)->create($argv[1]); fwrite(STDOUT, "done\n"); }
catch (Throwable) { fwrite(STDOUT, "not-claimed\n"); }
fflush(STDOUT);
PHP;
        $env = array_merge($_ENV, ['APP_ENV' => 'testing', 'APP_KEY' => (string) config('app.key'), 'DB_CONNECTION' => 'pgsql', 'DB_URL' => '', 'DB_HOST' => $host, 'DB_PORT' => (string) config('database.connections.pgsql.port'), 'DB_DATABASE' => 'hospeda_test', 'DB_USERNAME' => config('database.connections.pgsql.username'), 'DB_PASSWORD' => (string) config('database.connections.pgsql.password'), 'GITHUB_ACTIONS' => (string) getenv('GITHUB_ACTIONS')]);
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'a']];
        $a = $b = null;
        $pa = $pb = [];
        try {
            $a = proc_open([PHP_BINARY, '-r', $worker, $order->id], $spec, $pa, base_path(), $env);
            $b = proc_open([PHP_BINARY, '-r', $worker, $order->id], $spec, $pb, base_path(), $env);
            $this->assertIsResource($a);
            $this->assertIsResource($b);
            $this->assertTrue($this->hasOutput($pa[1], 15));
            $this->assertSame("ready\n", fgets($pa[1]));
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $this->assertSame("ready\n", fgets($pb[1]));
            fwrite($pa[0], "go\n"); fflush($pa[0]);
            $this->assertTrue($this->hasOutput($pa[1], 15));
            $this->assertSame("supplier-called\n", fgets($pa[1]));
            fwrite($pb[0], "go\n"); fflush($pb[0]);
            $this->assertTrue($this->hasOutput($pb[1], 15));
            $this->assertSame("not-claimed\n", fgets($pb[1]));
            fwrite($pa[0], "release\n"); fflush($pa[0]);
            $this->assertTrue($this->hasOutput($pa[1], 15));
            $this->assertSame("done\n", fgets($pa[1]));
            $this->assertSame('awaiting_seller_payment', $order->fresh()->status);
            $this->assertSame('1600', $order->fresh()->reservation_reference);
        } finally {
            foreach ([$pa, $pb] as $pipes) foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
            foreach ([$a, $b] as $process) if (is_resource($process)) { if (proc_get_status($process)['running']) proc_terminate($process, 9); proc_close($process); }
            $order->delete();
        }
    }

    private function hasOutput($stream, int $seconds): bool
    {
        $read = [$stream]; $write = null; $except = null;
        return stream_select($read, $write, $except, $seconds) > 0;
    }
}
