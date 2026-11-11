<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresCheckoutCancellationRaceTest extends TestCase
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
config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test',
    'services.stays.client_secret' => 'test', 'direct-booking.enabled' => true,
    'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.payment_provider' => 'cielo',
    'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24),
    'direct-booking.experimental_existing_cycle_settlement_enabled' => false,
    'direct-booking.experimental_existing_ledger_audit_enabled' => false,
    'direct-booking.experimental_existing_receivable_creation_enabled' => false]);
$payments = Mockery::mock(App\Services\Payments\DirectCheckoutPaymentService::class);
$payments->shouldReceive('availableMethods')->andReturn(['pix']);
app()->instance(App\Services\Payments\DirectCheckoutPaymentService::class, $payments);
$cielo = Mockery::mock(App\Services\Payments\CieloEcommerceClient::class);
$cielo->shouldReceive('merchantId')->andReturn('test-merchant');
app()->instance(App\Services\Payments\CieloEcommerceClient::class, $cielo);
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake(function (Illuminate\Http\Client\Request $request) use ($argv) {
    if ($request->method() !== 'GET') { throw new RuntimeException('Unexpected outbound write'); }
    return match (true) {
        str_contains($request->url(), '/finance/payment-providers/') => Illuminate\Support\Facades\Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Pix API Cielo']),
        str_ends_with($request->url(), '/payments') => Illuminate\Support\Facades\Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]),
        default => Illuminate\Support\Facades\Http::response(['id' => 'ZY92K', '_id' => strtolower($argv[1]), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']]),
    };
});
$id = $argv[1];
$kind = $argv[2];
fwrite(STDOUT, "ready\n"); fflush(STDOUT);
$decision = function () use ($id, $kind) {
    if ($kind === 'cancel') {
        return app(App\Services\ExistingReservationPaymentLock::class)->synchronized($id,
            fn (string $canonical) => app(App\Services\ReservationReleaseGuard::class)->claimGuestCancellation(['canonical' => $canonical, 'code' => 'ZY92K']));
    }
    $result = app(App\Services\ExistingReservationCheckoutService::class)->create('ZY92K', [
        'idempotencyKey' => 'race-'.strtolower($id), 'expectedBalanceCents' => 19750, 'paymentMethod' => 'pix',
        'guest' => ['fullName' => 'Teste', 'email' => 'test@example.test', 'phone' => '11999999999'],
    ]);
    if (! in_array([$result['status'], $result['code']], [[201, 'existing_checkout_ready'], [409, 'existing_checkout_unavailable']], true)) {
        throw new RuntimeException('Unexpected checkout result: '.json_encode($result));
    }
    return $result['status'] === 201;
};
if ($argv[3] === 'hold') {
    app(App\Services\ExistingReservationPaymentLock::class)->synchronized($id, function () use ($decision) {
        fwrite(STDOUT, ($decision() ? 'accepted' : 'blocked')."\n"); fflush(STDOUT);
        fgets(STDIN);
    });
} else {
    fwrite(STDOUT, ($decision() ? 'accepted' : 'blocked')."\n"); fflush(STDOUT);
}
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
            DB::table('stays_reservation_aliases')->where('canonical_id', $id)->delete();
        }
    }

    private function hasOutput($stream, int $seconds): bool
    {
        $read = [$stream]; $write = null; $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }
}
