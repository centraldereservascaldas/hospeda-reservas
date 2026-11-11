<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresReservationLockTransactionTest extends TestCase
{
    private array $ids = [];

    private bool $createdCoordinationRow = false;

    public function test_outer_transaction_and_stricter_isolation_fall_back_to_exclusive_coordination(): void
    {
        $this->requireIsolatedPostgres();
        $this->seedCoordinationRow();

        foreach (['external', 'repeatable read', 'serializable'] as $mode) {
            $this->assertCompetitorWaitsUntilRelease($mode, 'shared');
        }
    }

    public function test_savepoint_rollback_does_not_release_outer_shared_coordination_lock(): void
    {
        $this->requireIsolatedPostgres();
        $this->seedCoordinationRow();
        $this->assertCompetitorWaitsUntilRelease('savepoint', 'decision');
        $this->assertCompetitorProceedsAfterSavepointRollback();
    }

    private function assertCompetitorProceedsAfterSavepointRollback(): void
    {
        $idA = bin2hex(random_bytes(12));
        $idB = bin2hex(random_bytes(12));
        array_push($this->ids, $idA, $idB);
        $a = $this->startWorker('rollback-acquired', $idA);
        $b = null;
        try {
            $this->assertWorkerLine($a, 'locked', 10);
            $b = $this->startWorker('decision', $idB);
            $this->assertWorkerLine($b, 'locked', 10);
            foreach ([$a, $b] as $worker) {
                fwrite($worker[1][0], "release\n");
                fflush($worker[1][0]);
                $this->assertWorkerFinished($worker);
            }
        } finally {
            $this->stopWorker($a);
            if ($b !== null) {
                $this->stopWorker($b);
            }
        }
    }

    private function requireIsolatedPostgres(): void
    {
        if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true' || config('database.default') !== 'pgsql') {
            $this->markTestSkipped('Requires isolated Linux GitHub Actions PostgreSQL.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        $this->assertSame('127.0.0.1', config('database.connections.pgsql.host'));
        $this->assertSame('5432', (string) config('database.connections.pgsql.port'));
        $this->assertSame('hospeda_test', config('database.connections.pgsql.username'));
        $this->assertSame('ci-only-password', config('database.connections.pgsql.password'));
        $this->assertTrue(function_exists('proc_open'));
        $this->artisan('migrate')->assertSuccessful();
    }

    private function seedCoordinationRow(): void
    {
        $this->createdCoordinationRow = DB::table('existing_reservation_payment_locks')->insertOrIgnore(['stays_reservation_id' => 'coordination-decision', 'created_at' => now(), 'updated_at' => now()]) === 1;
    }

    protected function tearDown(): void
    {
        if ($this->ids !== []) {
            DB::table('existing_reservation_payment_locks')->whereIn('stays_reservation_id', $this->ids)->delete();
        }
        if ($this->createdCoordinationRow) {
            DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', 'coordination-decision')->delete();
        }
        parent::tearDown();
    }

    private function assertCompetitorWaitsUntilRelease(string $mode, string $competitorMode): void
    {
        $idA = bin2hex(random_bytes(12));
        $idB = bin2hex(random_bytes(12));
        array_push($this->ids, $idA, $idB);
        $a = $this->startWorker($mode, $idA);
        $b = null;
        try {
            $this->assertWorkerLine($a, 'locked', 10);
            $b = $this->startWorker($competitorMode, $idB);
            $deadline = microtime(true) + 10;
            do {
                DB::select('select pg_stat_clear_snapshot()');
                $activity = DB::selectOne('select pg_blocking_pids(pid) as blockers from pg_stat_activity where application_name = ?', [$b[2]]);
                $blockers = $activity ? trim($activity->blockers, '{}') : '';
                if ($blockers !== '') {
                    break;
                }
                usleep(50_000);
            } while (microtime(true) < $deadline);
            $this->assertContains((int) $a[3], $blockers === '' ? [] : array_map('intval', explode(',', $blockers)));
            fwrite($a[1][0], "release\n");
            fflush($a[1][0]);
            $this->assertWorkerLine($b, 'locked', 10);
            fwrite($b[1][0], "release\n");
            fflush($b[1][0]);
            $this->assertWorkerFinished($a);
            $this->assertWorkerFinished($b);
        } finally {
            $this->stopWorker($a);
            if ($b !== null) {
                $this->stopWorker($b);
            }
        }
    }

    private function startWorker(string $mode, string $id): array
    {
        $code = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true'
    || ! app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || config('database.connections.pgsql.host') !== '127.0.0.1' || (string) config('database.connections.pgsql.port') !== '5432'
    || config('database.connections.pgsql.username') !== 'hospeda_test' || config('database.connections.pgsql.password') !== 'ci-only-password') {
    throw new RuntimeException('Unsafe worker environment');
}
Illuminate\Support\Facades\DB::selectOne("select set_config('application_name', ?, false)", [$argv[3]]);
$pid = Illuminate\Support\Facades\DB::selectOne('select pg_backend_pid() as pid')->pid;
fwrite(STDOUT, "pid:$pid\n"); fflush(STDOUT);
class ExperimentalTransactionLock extends App\Services\ExistingReservationPaymentLock {
    protected function sharedProtocolEnabled(): bool { return true; }
}
$lock = new ExperimentalTransactionLock();
$mode = $argv[1];
$id = $argv[2];
$hold = function () { fwrite(STDOUT, "locked\n"); fflush(STDOUT); fgets(STDIN); };
if ($mode === 'seed') {
    Illuminate\Support\Facades\DB::table('existing_reservation_payment_locks')->insertOrIgnore(['stays_reservation_id' => 'coordination-decision', 'created_at' => now(), 'updated_at' => now()]);
    fwrite(STDOUT, "seeded\n"); fflush(STDOUT);
} elseif ($mode === 'external') {
    Illuminate\Support\Facades\DB::transaction(function () use ($lock, $id, $hold) {
        $lock->synchronized($id, fn () => null);
        $hold();
    });
} elseif ($mode === 'rollback-acquired') {
    Illuminate\Support\Facades\DB::transaction(function () use ($lock, $id, $hold) {
        try {
            Illuminate\Support\Facades\DB::transaction(function () use ($lock, $id) {
                $lock->synchronized($id, fn () => null);
                throw new RuntimeException('rollback acquired');
            });
        } catch (RuntimeException $e) {
            if ($e->getMessage() !== 'rollback acquired') { throw $e; }
        }
        $hold();
    });
} elseif ($mode === 'savepoint') {
    $lock->synchronized($id, function () use ($hold) {
        try {
            Illuminate\Support\Facades\DB::transaction(function () { throw new RuntimeException('rollback savepoint'); });
        } catch (RuntimeException $e) {
            if ($e->getMessage() !== 'rollback savepoint') { throw $e; }
        }
        $hold();
    });
} elseif ($mode === 'decision') {
    $lock->synchronizedDecision($hold);
} else {
    if ($mode !== 'shared') {
        Illuminate\Support\Facades\DB::statement('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL '.strtoupper($mode));
    }
    $lock->synchronized($id, $hold);
}
PHP;
        $pipes = [];
        $name = 'lock-test-'.bin2hex(random_bytes(12));
        $env = ['CI' => 'true', 'GITHUB_ACTIONS' => 'true', 'APP_ENV' => 'testing',
            'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'DB_CONNECTION' => 'pgsql',
            'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432', 'DB_DATABASE' => 'hospeda_test',
            'DB_USERNAME' => 'hospeda_test', 'DB_PASSWORD' => 'ci-only-password', 'DB_URL' => '',
            'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'];
        $process = proc_open([PHP_BINARY, '-r', $code, $mode, $id, $name], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), $env);
        $this->assertIsResource($process);
        try {
            $this->assertTrue($this->workerHasOutput($pipes[1], 10), 'Worker did not report its PID.');
            $line = fgets($pipes[1]);
            $this->assertMatchesRegularExpression('/^pid:[0-9]+\n$/', $line);

            return [$process, $pipes, $name, (int) substr($line, 4)];
        } catch (\Throwable $exception) {
            $this->stopWorker([$process, $pipes]);
            throw $exception;
        }
    }

    private function assertWorkerLine(array $worker, string $line, int $seconds): void
    {
        $this->assertTrue($this->workerHasOutput($worker[1][1], $seconds), 'Worker produced no output.');
        $this->assertSame($line."\n", fgets($worker[1][1]));
    }

    private function workerHasOutput($stream, int $seconds): bool
    {
        $read = [$stream];
        $write = null;
        $except = null;

        return stream_select($read, $write, $except, $seconds) > 0;
    }

    private function assertWorkerFinished(array $worker): void
    {
        for ($tries = 0; $tries < 100; $tries++) {
            $status = proc_get_status($worker[0]);
            if (! $status['running']) {
                $this->assertSame(0, $status['exitcode'], stream_get_contents($worker[1][2]));

                return;
            }
            usleep(100_000);
        }
        $this->fail('Worker did not finish.');
    }

    private function stopWorker(array $worker): void
    {
        foreach ($worker[1] as $pipe) {
            if (is_resource($pipe)) {
                fclose($pipe);
            }
        }
        if (is_resource($worker[0])) {
            proc_terminate($worker[0]);
            proc_close($worker[0]);
        }
    }
}
