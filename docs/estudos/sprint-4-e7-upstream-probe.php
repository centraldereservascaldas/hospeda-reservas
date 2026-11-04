<?php

// Run once per PHP process as the web user. Prints counters, never request payloads.
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\Response;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\RequestInterface;

$started = hrtime(true);
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$bootstrapMs = (hrtime(true) - $started) / 1_000_000;
$requests = 0;
$denied = 0;
$host = parse_url((string) config('services.stays.base_url'), PHP_URL_HOST);
Http::globalOptions(['allow_redirects' => false]);
Http::globalMiddleware(function (callable $handler) use (&$requests, &$denied, $host): callable {
    return function (RequestInterface $request, array $options) use ($handler, &$requests, &$denied, $host): PromiseInterface {
        $path = $request->getUri()->getPath();
        $allowed = $request->getUri()->getHost() === $host
            && $request->getUri()->getScheme() === 'https'
            && (($request->getMethod() === 'GET' && in_array($path, [
                '/external/v1/content/listings', '/external/v1/content/properties',
                '/external/v1/translation/listing-amenities', '/external/v1/translation/property-amenities',
            ], true)) || ($request->getMethod() === 'POST' && in_array($path, [
                '/external/v1/booking/search-listings', '/external/v1/booking/calculate-price',
            ], true)));
        if (! $allowed || $requests >= 6) {
            $denied++;

            return Create::promiseFor(new Response(503, ['Content-Type' => 'application/json'], '{}'));
        }
        $requests++;

        return $handler($request, $options);
    };
});
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$request = Request::create('https://www.centraldereservascaldas.com/api/search', 'POST', [], [], [], [
    'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
], json_encode(['from' => '2026-11-13', 'to' => '2026-11-15', 'guests' => 2, 'limit' => 8, 'skip' => 0], JSON_THROW_ON_ERROR));
$beforeRequest = hrtime(true);
$response = $kernel->handle($request);
$durationMs = (hrtime(true) - $beforeRequest) / 1_000_000;
$json = json_decode($response->getContent(), true);
$kernel->terminate($request, $response);
echo json_encode([
    'reportedAt' => gmdate(DATE_ATOM),
    'status' => $response->getStatusCode(), 'bootstrapMs' => round($bootstrapMs, 2),
    'durationMs' => round($durationMs, 2), 'upstreamRequests' => $requests, 'deniedRequests' => $denied,
    'resultCount' => is_array($json['data'] ?? null) ? count($json['data']) : null,
    'unquotedCount' => $json['unquotedCount'] ?? null,
    'expiresAt' => $json['meta']['expiresAt'] ?? null,
    'peakPhpAllocatedBytes' => memory_get_peak_usage(true),
], JSON_THROW_ON_ERROR).PHP_EOL;
