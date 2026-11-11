<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PostgresLegacyEvidenceRaceTest extends TestCase
{
    public function test_competing_captures_preserve_the_first_evidence(): void
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
        $this->assertTrue(function_exists('proc_open'));
        $this->artisan('migrate')->assertSuccessful();

        $id = (string) Str::uuid();
        $reference = strtoupper(substr(str_replace('-', '', $id), 0, 5));
        $canonicals = [bin2hex(random_bytes(12)), bin2hex(random_bytes(12))];
        $order = new DirectBookingOrder([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'evidence-race-'.$id,
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing', 'stays_listing_id' => 'listing',
            'stays_client_id' => 'client', 'stays_reservation_id' => $reference, 'check_in' => '2026-11-13',
            'check_out' => '2026-11-16', 'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0],
            'guest_name' => 'Teste', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '10.00', 'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test',
            'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(), 'origin' => 'website', 'operational_events' => [],
        ]);
        $order->id = $id;
        $order->save();

        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || config('database.connections.pgsql.host') !== '127.0.0.1'
    || (string) config('database.connections.pgsql.port') !== '5432'
    || config('database.connections.pgsql.username') !== 'hospeda_test'
    || config('database.connections.pgsql.password') !== 'ci-only-password') {
    throw new RuntimeException('Unsafe worker environment');
}
Illuminate\Support\Facades\DB::selectOne("select set_config('application_name', ?, false)", [$argv[3]]);
config(['services.stays.base_url' => 'https://stays.example.test', 'services.stays.client_id' => 'test-account', 'services.stays.client_secret' => 'test-secret']);
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake(function ($request) use ($argv) {
    if ($request->method() !== 'GET' || ! str_ends_with($request->url(), '/booking/reservations/'.$argv[2])
        || Illuminate\Support\Facades\DB::transactionLevel() !== 0) {
        throw new RuntimeException('Unexpected Stays request');
    }
    fwrite(STDOUT, "ready\n"); fflush(STDOUT);
    if (trim(fgets(STDIN)) !== 'go') { throw new RuntimeException('Barrier failed'); }
    return Illuminate\Support\Facades\Http::response(['_id' => $argv[3], 'id' => $argv[2], '_idlisting' => 'listing',
        '_idclient' => 'client', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16',
        'internalNote' => 'CRCN_DIRECT_ORDER:'.$argv[1]]);
});
$result = app(App\Services\ExperimentalLegacyReservationEvidence::class)->capture($argv[1]);
fwrite(STDOUT, ($result ? 'accepted' : 'rejected')."\n"); fflush(STDOUT);
PHP;
        $env = ['CI' => 'true', 'GITHUB_ACTIONS' => 'true', 'APP_ENV' => 'testing',
            'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'DB_CONNECTION' => 'pgsql',
            'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432', 'DB_DATABASE' => 'hospeda_test',
            'DB_USERNAME' => 'hospeda_test', 'DB_PASSWORD' => 'ci-only-password', 'DB_URL' => '',
            'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'];
        $processes = $pipes = [];
        try {
            DB::beginTransaction();
            DirectBookingOrder::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            foreach ($canonicals as $i => $canonical) {
                $processes[$i] = proc_open([PHP_BINARY, '-r', $worker, $id, $reference, $canonical],
                    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes[$i], base_path(), $env);
                $this->assertIsResource($processes[$i]);
                $this->assertTrue($this->hasOutput($pipes[$i][1], 10), 'Worker did not reach the fake Stays response.');
                $this->assertSame("ready\n", fgets($pipes[$i][1]));
            }
            foreach ($pipes as $pipe) { fwrite($pipe[0], "go\n"); fflush($pipe[0]); }
            // One capture waits on the order; the other waits on the shared decision lock.
            $parentPid = DB::selectOne('select pg_backend_pid() as pid')->pid;
            $names = $canonicals;
            $blocked = [];
            $deadline = microtime(true) + 10;
            do {
                DB::select('select pg_stat_clear_snapshot()');
                $activities = DB::select('select pid, application_name, pg_blocking_pids(pid) as blockers from pg_stat_activity where application_name in (?, ?)', $names);
                $blocked = [];
                foreach ($activities as $activity) {
                    $blockers = trim($activity->blockers, '{}');
                    $blocked[$activity->application_name] = ['pid' => (int) $activity->pid,
                        'blockers' => $blockers === '' ? [] : array_map('intval', explode(',', $blockers))];
                }
                if (count($blocked) === 2 && $blocked[$names[0]]['blockers'] && $blocked[$names[1]]['blockers']) {
                    break;
                }
                usleep(50000);
            } while (microtime(true) < $deadline);
            $this->assertCount(2, $blocked, 'Both capture connections must be visible in pg_stat_activity.');
            foreach ($names as $name) {
                $this->assertNotEmpty($blocked[$name]['blockers'], 'Both captures must be blocked in PostgreSQL.');
            }
            $first = in_array((int) $parentPid, $blocked[$names[0]]['blockers'], true) ? 0 : 1;
            $this->assertContains((int) $parentPid, $blocked[$names[$first]]['blockers']);
            $this->assertContains($blocked[$names[$first]]['pid'], $blocked[$names[1 - $first]]['blockers']);
            DB::commit();
            $results = [];
            foreach ($pipes as $pipe) {
                $this->assertTrue($this->hasOutput($pipe[1], 10), 'Capture did not finish after releasing the order.');
                $results[] = trim(fgets($pipe[1]));
            }
            $this->assertEqualsCanonicalizing(['accepted', 'rejected'], $results);
            $rows = DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $id)->get();
            $this->assertCount(1, $rows);
            $winner = array_search('accepted', $results, true);
            $this->assertSame($canonicals[$winner], $rows[0]->canonical_id);
            $this->assertSame($reference, $rows[0]->reservation_reference);
            $this->assertSame($reference, $order->fresh()->stays_reservation_id);
            $this->assertSame(hash('sha256', json_encode(['https://stays.example.test', 'test-account'], JSON_THROW_ON_ERROR)), $rows[0]->account_fingerprint);
            $this->assertSame(app(\App\Services\ExperimentalLegacyReservationEvidence::class)->snapshot($order->fresh()), $rows[0]->order_snapshot_hash);
        } finally {
            if (DB::transactionLevel() > 0) { DB::rollBack(); }
            foreach ($pipes as $pipeSet) { foreach ($pipeSet as $pipe) { if (is_resource($pipe)) { fclose($pipe); } } }
            foreach ($processes as $process) { if (is_resource($process)) { proc_terminate($process); proc_close($process); } }
            DB::table('legacy_reservation_order_evidence')->where('direct_booking_order_id', $id)->delete();
            DirectBookingOrder::query()->whereKey($id)->delete();
            DB::table('existing_reservation_payment_locks')->whereIn('stays_reservation_id', $canonicals)->delete();
        }
    }

    private function hasOutput($stream, int $seconds): bool
    {
        $read = [$stream]; $write = null; $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }
}
