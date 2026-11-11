<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresGuestControllerCheckoutRaceTest extends TestCase
{
    public function test_checkout_is_blocked_while_guest_cancellation_patch_is_in_flight(): void
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
    'direct-booking.experimental_existing_ledger_audit_enabled' => true,
    'direct-booking.experimental_existing_receivable_creation_enabled' => false]);
$payments = Mockery::mock(App\Services\Payments\DirectCheckoutPaymentService::class);
$payments->shouldReceive('availableMethods')->andReturn(['pix']);
app()->instance(App\Services\Payments\DirectCheckoutPaymentService::class, $payments);
$cielo = Mockery::mock(App\Services\Payments\CieloEcommerceClient::class);
$cielo->shouldReceive('merchantId')->andReturn('test-merchant');
app()->instance(App\Services\Payments\CieloEcommerceClient::class, $cielo);
$audit = Mockery::mock(App\Services\ExistingReservationLedgerAudit::class);
$audit->shouldReceive('confirmsSnapshot')->andReturnTrue();
app()->instance(App\Services\ExistingReservationLedgerAudit::class, $audit);
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake(function (Illuminate\Http\Client\Request $request) use ($argv) {
    if ($request->method() === 'PATCH' && str_contains($request->url(), '/booking/reservations/')) {
        fwrite(STDOUT, "patch-started\n"); fflush(STDOUT);
        fgets(STDIN);
        return Illuminate\Support\Facades\Http::response([], 503);
    }
    if ($request->method() !== 'GET') { throw new RuntimeException('Unexpected outbound write'); }
    $record = ['id' => $argv[3], '_id' => strtolower($argv[1]), '_idclient' => 'client-'.strtolower($argv[1]), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'partner' => ['name' => 'API booking.com']];
    return match (true) {
        str_contains($request->url(), '/booking/clients/') => Illuminate\Support\Facades\Http::response(['client' => ['reservations' => [$record]]]),
        str_contains($request->url(), '/finance/payment-providers/') => Illuminate\Support\Facades\Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Pix API Cielo']),
        str_ends_with($request->url(), '/payments') => Illuminate\Support\Facades\Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]),
        default => Illuminate\Support\Facades\Http::response($record),
    };
});
$id = $argv[1];
$kind = $argv[2];
fwrite(STDOUT, "ready\n"); fflush(STDOUT);
$decision = function () use ($id, $kind, $argv) {
    if ($kind === 'cancel') {
        $request = Illuminate\Http\Request::create('/api/my-reservations/'.$argv[3].'/cancel', 'POST');
        $request->attributes->set('verified_guest', new App\Data\VerifiedGuest($argv[4], 'guest@example.test', 'Guest Example', []));
        $response = app(App\Http\Controllers\Api\GuestReservationController::class)->cancel($request, $argv[3]);
        $result = $response->getData(true);
        if (! in_array([$response->getStatusCode(), $result['code'] ?? null], [[502, 'stays_cancel_failed'], [409, 'direct_booking_cancellation_requires_support']], true)) {
            throw new RuntimeException('Unexpected cancellation result: '.json_encode($result));
        }
        return $response->getStatusCode() === 502;
    }
    $result = app(App\Services\ExistingReservationCheckoutService::class)->create($argv[3], [
        'idempotencyKey' => 'race-'.strtolower($id), 'expectedBalanceCents' => 19750, 'paymentMethod' => 'pix',
        'guest' => ['fullName' => 'Teste', 'email' => 'test@example.test', 'phone' => '11999999999'],
    ]);
    if (! in_array([$result['status'], $result['code']], [[201, 'existing_checkout_ready'], [409, 'existing_checkout_unavailable']], true)) {
        throw new RuntimeException('Unexpected checkout result: '.json_encode($result));
    }
    return $result['status'] === 201;
};
fwrite(STDOUT, ($decision() ? 'accepted' : 'blocked')."\n"); fflush(STDOUT);
PHP;
        $id = bin2hex(random_bytes(12));
        $code = strtoupper(\Illuminate\Support\Str::random(5));
        $guestId = (string) \Illuminate\Support\Str::uuid();
        $env = ['CI' => 'true', 'GITHUB_ACTIONS' => 'true', 'APP_ENV' => 'testing',
            'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'DB_CONNECTION' => 'pgsql',
            'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432', 'DB_DATABASE' => 'hospeda_test',
            'DB_USERNAME' => 'hospeda_test', 'DB_PASSWORD' => 'ci-only-password', 'DB_URL' => '',
            'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'];
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $a = $b = null;
        $pipesA = $pipesB = [];
        try {
            \App\Models\GuestProfile::query()->create(['id' => $guestId, 'full_name' => 'Guest Example', 'stays_client_id' => 'client-'.$id]);
            $a = proc_open([PHP_BINARY, '-r', $worker, $id, 'cancel', $code, $guestId], $spec, $pipesA, base_path(), $env);
            $this->assertIsResource($a);
            $this->assertTrue($this->hasOutput($pipesA[1], 10));
            $this->assertSame("ready\n", fgets($pipesA[1]));
            $this->assertTrue($this->hasOutput($pipesA[1], 10), 'Cancellation did not reach the simulated PATCH.');
            $this->assertSame("patch-started\n", fgets($pipesA[1]));
            $this->assertNotNull(DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', $id)->value('guest_cancel_claimed_at'));

            $b = proc_open([PHP_BINARY, '-r', $worker, strtoupper($id), 'payment', $code, $guestId], $spec, $pipesB, base_path(), $env);
            $this->assertIsResource($b);
            $this->assertTrue($this->hasOutput($pipesB[1], 10));
            $this->assertSame("ready\n", fgets($pipesB[1]));
            $this->assertTrue($this->hasOutput($pipesB[1], 10), 'Checkout did not finish while PATCH was pending.');
            $this->assertSame("blocked\n", fgets($pipesB[1]));
            $this->assertSame(0, DB::table('direct_booking_orders')->where('stays_reservation_id', $id)->count());

            fwrite($pipesA[0], "finish\n"); fflush($pipesA[0]);
            $this->assertTrue($this->hasOutput($pipesA[1], 10));
            $this->assertSame("accepted\n", fgets($pipesA[1]));
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
            DB::table('guest_profiles')->where('id', $guestId)->delete();
        }
    }

    private function hasOutput($stream, int $seconds): bool
    {
        $read = [$stream]; $write = null; $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }
}
