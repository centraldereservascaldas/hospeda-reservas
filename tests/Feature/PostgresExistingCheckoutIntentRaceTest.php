<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PostgresExistingCheckoutIntentRaceTest extends TestCase
{
    #[\PHPUnit\Framework\Attributes\DataProvider('races')]
    public function test_cloned_tabs_are_serialized(string $second, array $allowed): void
    {
        if (PHP_OS_FAMILY !== 'Linux' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('CI') !== 'true'
            || DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires the isolated GitHub Actions PostgreSQL service.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hospeda_test', DB::connection()->getDatabaseName());
        $this->assertSame('127.0.0.1', config('database.connections.pgsql.host'));
        $this->assertSame('hospeda_test', config('database.connections.pgsql.username'));
        $this->assertSame('ci-only-password', config('database.connections.pgsql.password'));
        $this->artisan('migrate')->assertSuccessful();
        $worker = <<<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql'
    || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'hospeda_test'
    || config('database.connections.pgsql.host') !== '127.0.0.1'
    || config('database.connections.pgsql.username') !== 'hospeda_test'
    || config('database.connections.pgsql.password') !== 'ci-only-password') throw new RuntimeException('Unsafe environment');
config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
$payload = in_array($argv[2], ['valid', 'different'], true) ? ['expectedBalanceCents' => 10000, 'paymentMethod' => 'pix',
    'guest' => ['fullName' => 'Guest', 'email' => 'guest@example.test', 'phone' => '11999999999'], 'acceptedPayment' => true] : [];
if ($argv[2] === 'different') $payload['expectedBalanceCents'] = 10001;
$request = Illuminate\Http\Request::create('/checkout', 'POST', $payload, [], [], ['HTTP_IDEMPOTENCY_KEY' => $argv[1]]);
$route = new Illuminate\Routing\Route('POST', '/', []);
$route->bind($request);
        $route->setParameter('code', 'ZX91K');
$request->setRouteResolver(fn () => $route);
fwrite(STDOUT, "ready\n"); fflush(STDOUT); fgets(STDIN);
$response = app(App\Http\Middleware\GuardExistingCheckoutIntent::class)->handle($request, fn () => response()->json([], 201));
fwrite(STDOUT, $response->getStatusCode()."\n"); fflush(STDOUT);
PHP;
        $env = ['CI' => 'true', 'GITHUB_ACTIONS' => 'true', 'APP_ENV' => 'testing',
            'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'DB_CONNECTION' => 'pgsql',
            'DB_HOST' => '127.0.0.1', 'DB_PORT' => '5432', 'DB_DATABASE' => 'hospeda_test',
            'DB_USERNAME' => 'hospeda_test', 'DB_PASSWORD' => 'ci-only-password', 'DB_URL' => '',
            'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'];
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $key = 'race-intent-'.bin2hex(random_bytes(16));
        $a = $b = null; $pipesA = $pipesB = [];
        try {
            $a = proc_open([PHP_BINARY, '-r', $worker, $key, 'valid'], $spec, $pipesA, base_path(), $env);
            $b = proc_open([PHP_BINARY, '-r', $worker, $key, $second], $spec, $pipesB, base_path(), $env);
            $this->assertIsResource($a); $this->assertIsResource($b);
            $this->assertTrue($this->ready($pipesA[1])); $this->assertSame("ready\n", fgets($pipesA[1]));
            $this->assertTrue($this->ready($pipesB[1])); $this->assertSame("ready\n", fgets($pipesB[1]));
            fwrite($pipesA[0], "go\n"); fflush($pipesA[0]);
            fwrite($pipesB[0], "go\n"); fflush($pipesB[0]);
            $this->assertTrue($this->ready($pipesA[1])); $valid = (int) fgets($pipesA[1]);
            $this->assertTrue($this->ready($pipesB[1])); $invalid = (int) fgets($pipesB[1]);
            $this->assertContains([$valid, $invalid], $allowed);
            $this->assertSame($valid === 201 || $invalid === 201 ? 'claimed' : 'rejected', DB::table('existing_checkout_intents')->where('key_hash', hash('sha256', $key))->value('state'));
        } finally {
            foreach ([$pipesA, $pipesB] as $pipes) foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
            foreach ([$a, $b] as $process) if (is_resource($process)) { proc_terminate($process); proc_close($process); }
            DB::table('existing_checkout_intents')->where('key_hash', hash('sha256', $key))->delete();
        }
    }

    public static function races(): array
    {
        return [
            ['invalid', [[201, 409], [409, 422]]],
            ['different', [[201, 409], [409, 201]]],
        ];
    }

    private function ready($stream): bool
    {
        $read = [$stream]; $write = null; $except = null;
        return stream_select($read, $write, $except, 10) > 0;
    }
}
