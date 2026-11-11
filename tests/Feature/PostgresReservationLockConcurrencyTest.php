<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresReservationLockConcurrencyTest extends TestCase
{
    use RefreshDatabase;

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
