<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class StaysSearchConcurrencyTest extends TestCase
{
    public function test_independent_processes_share_one_upstream_recomputation(): void
    {
        $this->exerciseConcurrentSearch(releaseOnContention: true);
    }

    public function test_lock_timeout_returns_unavailability_without_starting_a_second_upstream_request(): void
    {
        $this->exerciseConcurrentSearch(releaseOnContention: false);
    }

    private function exerciseConcurrentSearch(bool $releaseOnContention): void
    {
        $directory = sys_get_temp_dir().'/stays-search-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        touch($directory.'/cache.sqlite');
        $suffix = bin2hex(random_bytes(8));
        $cacheTable = 'search_cache_'.$suffix;
        $lockTable = 'search_cache_locks_'.$suffix;
        $connection = config('database.default') === 'pgsql'
            ? config('database.connections.pgsql')
            : ['driver' => 'sqlite', 'database' => $directory.'/cache.sqlite', 'foreign_key_constraints' => true];
        config(['database.connections.search_concurrency' => $connection]);
        Schema::connection('search_concurrency')->create($cacheTable, function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->text('value');
            $table->integer('expiration');
        });
        Schema::connection('search_concurrency')->create($lockTable, function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->string('owner');
            $table->integer('expiration');
        });
        $script = <<<'PHP'
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$directory = $argv[2];
$role = $argv[3];
config([
    'database.connections.search_concurrency' => getenv('DB_CONNECTION') === 'pgsql' ? config('database.connections.pgsql') : ['driver' => 'sqlite', 'database' => $directory.'/cache.sqlite'],
    'cache.stores.search_concurrency' => ['driver' => 'database', 'connection' => 'search_concurrency', 'table' => $argv[4], 'lock_table' => $argv[5]],
    'cache.prefix' => 'search-test:', 'services.stays.search_cache_store' => 'search_concurrency',
    'services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret',
]);
Illuminate\Support\Facades\DB::connection('search_concurrency')->listen(function ($query) use ($directory, $role): void {
    if ($role === 'contender' && str_starts_with(strtolower($query->sql), 'update') && str_contains($query->sql, 'search_cache_locks_')) {
        file_put_contents($directory.'/contender-blocked', '1');
    }
});
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake(['https://stays.test/external/v1/booking/search-listings' => function () use ($directory, $role) {
    file_put_contents($directory.'/upstream-requests', $role."\n", FILE_APPEND | LOCK_EX);
    file_put_contents($directory.'/owner-entered', '1');
    $deadline = microtime(true) + 10;
    while (!is_file($directory.'/release-owner')) {
        if (microtime(true) > $deadline) { throw new RuntimeException('Owner barrier timed out.'); }
        usleep(10000);
    }
    return Illuminate\Support\Facades\Http::response([]);
}]);
$result = app(App\Services\StaysSearchAvailabilityService::class)->search(['from' => '2027-01-10', 'to' => '2027-01-12', 'guests' => 2, 'limit' => 8]);
file_put_contents($directory.'/'.$role.'-result', json_encode($result, JSON_THROW_ON_ERROR));
PHP;
        $owner = new Process([PHP_BINARY, '-r', $script, '--', base_path(), $directory, 'owner', $cacheTable, $lockTable], base_path(), timeout: 15);
        $contender = new Process([PHP_BINARY, '-r', $script, '--', base_path(), $directory, 'contender', $cacheTable, $lockTable], base_path(), timeout: 15);
        try {
            $owner->start();
            $this->waitForMarker($directory.'/owner-entered', $owner);
            $contender->start();
            $this->waitForMarker($directory.'/contender-blocked', $contender);
            if ($releaseOnContention) {
                file_put_contents($directory.'/release-owner', '1');
            }
            $this->assertSame(0, $contender->wait(), $contender->getErrorOutput());
            if (! $releaseOnContention) {
                $this->assertNull(json_decode(file_get_contents($directory.'/contender-result'), true, flags: JSON_THROW_ON_ERROR));
                file_put_contents($directory.'/release-owner', '1');
            }
            $this->assertSame(0, $owner->wait(), $owner->getErrorOutput());
            $this->assertSame("owner\n", file_get_contents($directory.'/upstream-requests'));
            $first = json_decode(file_get_contents($directory.'/owner-result'), true, flags: JSON_THROW_ON_ERROR);
            $second = json_decode(file_get_contents($directory.'/contender-result'), true, flags: JSON_THROW_ON_ERROR);
            $this->assertIsArray($first);
            if ($releaseOnContention) {
                $this->assertSame($first, $second);
            }
            $this->assertSame(0, $first['unquotedCount']);
        } finally {
            $owner->stop();
            $contender->stop();
            Schema::connection('search_concurrency')->dropIfExists($lockTable);
            Schema::connection('search_concurrency')->dropIfExists($cacheTable);
            DB::purge('search_concurrency');
            File::deleteDirectory($directory);
        }
    }

    private function waitForMarker(string $path, Process $process): void
    {
        $deadline = microtime(true) + 5;
        while (! is_file($path)) {
            $process->checkTimeout();
            if (! $process->isRunning() || microtime(true) > $deadline) {
                $this->fail('Process did not reach the expected concurrency barrier: '.$process->getErrorOutput().$process->getOutput());
            }
            usleep(10000);
        }
    }
}
