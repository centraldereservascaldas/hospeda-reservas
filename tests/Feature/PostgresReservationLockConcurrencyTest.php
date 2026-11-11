<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresReservationLockConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_experimental_shared_protocol_and_legacy_locks(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        $this->assertTrue(function_exists('proc_open'));

        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
class ExperimentalTestLock extends App\Services\ExistingReservationPaymentLock {
    protected function sharedProtocolEnabled(): bool { return true; }
}
$lock = new ExperimentalTestLock();
$id = $argv[2];
$hold = function () { fwrite(STDOUT, "locked\n"); fflush(STDOUT); fgets(STDIN); };
if ($argv[1] === 'seed') {
    Illuminate\Support\Facades\DB::table('existing_reservation_payment_locks')->insertOrIgnore(['stays_reservation_id' => 'coordination-decision', 'created_at' => now(), 'updated_at' => now()]);
    fwrite(STDOUT, "seeded\n");
} elseif ($argv[1] === 'old') {
    Illuminate\Support\Facades\DB::transaction(function () use ($hold) {
        Illuminate\Support\Facades\DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', 'coordination-decision')->lockForUpdate()->firstOrFail();
        $hold();
    });
} elseif ($argv[1] === 'decision') {
    $lock->synchronizedDecision($hold);
} elseif ($argv[1] === 'external') {
    Illuminate\Support\Facades\DB::transaction(function () use ($lock, $id, $hold) {
        $lock->synchronized($id, fn () => $lock->synchronized($id, fn () => null));
        $hold();
    });
} elseif ($argv[1] === 'reentrant') {
    $lock->synchronized($id, function () use ($id, $hold) {
        (new ExperimentalTestLock())->synchronized($id, $hold);
    });
} elseif ($argv[1] === 'upgrade') {
    $lock->synchronized($id, function () use ($lock) {
        try { $lock->synchronizedDecision(fn () => null); throw new RuntimeException('upgrade allowed'); }
        catch (LogicException $e) { fwrite(STDOUT, "rejected\n"); }
    });
} else {
    $lock->synchronized($id, $hold);
}
PHP;
        $id = bin2hex(random_bytes(12));
        $other = bin2hex(random_bytes(12));
        $seed = $this->startLockWorker($worker, 'seed', $id);
        try {
            $this->assertTrue($this->workerHasOutput($seed[1][1], 10));
            $this->assertSame("seeded\n", fgets($seed[1][1]));
            $this->assertWorkerFinished($seed);
        } finally {
            $this->stopLockWorker($seed);
        }

        foreach ([
            ['shared', $id, 'shared', $other, false],
            ['shared', $id, 'shared', $id, true],
            ['shared', $id, 'decision', $other, true],
            ['decision', $id, 'shared', $other, true],
            ['old', $id, 'shared', $other, true],
            ['shared', $id, 'old', $other, true],
            ['external', $id, 'shared', $other, true],
            ['reentrant', $id, 'shared', $other, false],
        ] as [$modeA, $idA, $modeB, $idB, $blocks]) {
            $a = $this->startLockWorker($worker, $modeA, $idA);
            $b = null;
            try {
                $this->assertTrue($this->workerHasOutput($a[1][1], 10), $modeA.' did not acquire lock');
                $this->assertSame("locked\n", fgets($a[1][1]));
                $b = $this->startLockWorker($worker, $modeB, $idB);
                $this->assertSame(! $blocks, $this->workerHasOutput($b[1][1], 2), "$modeA versus $modeB");
                if (! $blocks) {
                    $this->assertSame("locked\n", fgets($b[1][1]));
                }
                fwrite($a[1][0], "release\n");
                fflush($a[1][0]);
                if ($blocks) {
                    $this->assertTrue($this->workerHasOutput($b[1][1], 10));
                    $this->assertSame("locked\n", fgets($b[1][1]));
                }
                fwrite($b[1][0], "release\n");
                fflush($b[1][0]);
                $this->assertWorkerFinished($a);
                $this->assertWorkerFinished($b);
            } finally {
                $this->stopLockWorker($a);
                if ($b !== null) {
                    $this->stopLockWorker($b);
                }
            }
        }

        $upgrade = $this->startLockWorker($worker, 'upgrade', $id);
        try {
            $this->assertTrue($this->workerHasOutput($upgrade[1][1], 10));
            $this->assertSame("rejected\n", fgets($upgrade[1][1]));
            $this->assertWorkerFinished($upgrade);
        } finally {
            $this->stopLockWorker($upgrade);
        }
    }

    private function startLockWorker(string $worker, string $mode, string $id): array
    {
        $pipes = [];
        $process = proc_open([PHP_BINARY, '-r', $worker, $mode, $id], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path());
        $this->assertIsResource($process);

        return [$process, $pipes];
    }

    private function stopLockWorker(array $worker): void
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

    public function test_two_workers_serialize_the_same_reservation(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        if (! function_exists('proc_open')) {
            $this->fail('Two-worker test requires proc_open.');
        }

        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
app(App\Services\ExistingReservationPaymentLock::class)->synchronized($argv[1], function () {
    fwrite(STDOUT, "locked\n");
    fflush(STDOUT);
    fgets(STDIN);
});
PHP;
        $id = bin2hex(random_bytes(12));
        $pipesA = [];
        $pipesB = [];
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $a = proc_open([PHP_BINARY, '-r', $worker, $id], $spec, $pipesA, base_path());
        $b = null;
        try {
            $this->assertIsResource($a);
            $this->assertTrue($this->workerHasOutput($pipesA[1], 10));
            $this->assertSame("locked\n", fgets($pipesA[1]));
            $b = proc_open([PHP_BINARY, '-r', $worker, $id], $spec, $pipesB, base_path());
            $this->assertIsResource($b);
            $this->assertFalse($this->workerHasOutput($pipesB[1], 1), 'Second worker acquired an active reservation lock.');
            fwrite($pipesA[0], "release\n");
            fflush($pipesA[0]);
            $this->assertTrue($this->workerHasOutput($pipesB[1], 10));
            $this->assertSame("locked\n", fgets($pipesB[1]));
            fwrite($pipesB[0], "release\n");
            fflush($pipesB[0]);
            foreach ([$a, $b] as $process) {
                for ($tries = 0; $tries < 50 && proc_get_status($process)['running']; $tries++) {
                    usleep(100_000);
                }
                $this->assertFalse(proc_get_status($process)['running'], 'Worker did not finish after release.');
            }
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
