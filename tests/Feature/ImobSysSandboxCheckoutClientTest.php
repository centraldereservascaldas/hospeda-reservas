<?php

namespace Tests\Feature;

use App\Services\ImobSysSandboxCheckoutClient;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class ImobSysSandboxCheckoutClientTest extends TestCase
{
    public function test_sandbox_is_disabled_by_default(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => false]);
        Http::preventStrayRequests();
        try {
            app(ImobSysSandboxCheckoutClient::class)->start(['id' => 'ORDER1']);
            $this->fail('A disabled checkout must refuse requests.');
        } catch (RuntimeException) {
            Http::assertNothingSent();
        }
    }

    public function test_server_only_key_and_no_retry_on_uncertain_response(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.partner_checkout_sandbox.base_url' => 'https://isolated.example.test', 'services.partner_checkout_sandbox.key' => str_repeat('a', 64)]);
        Http::preventStrayRequests();
        Http::fake(['isolated.example.test/*' => Http::response(['success' => false], 503)]);
        try {
            app(ImobSysSandboxCheckoutClient::class)->start(['id' => 'ORDER1']);
            $this->fail('An uncertain response must fail closed.');
        } catch (RuntimeException) {
            Http::assertSentCount(1);
            Http::assertSent(fn (Request $request): bool => $request->url() === 'https://isolated.example.test/internal/checkout/start' && $request->hasHeader('x-local-control', str_repeat('a', 64)));
        }
    }

    public function test_status_is_queried_before_retrying_an_uncertain_payment(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.partner_checkout_sandbox.base_url' => 'https://isolated.example.test', 'services.partner_checkout_sandbox.key' => str_repeat('a', 64)]);
        Http::preventStrayRequests();
        Http::fake(['isolated.example.test/*' => Http::response(['success' => true, 'order' => ['state' => 'payment_starting']])]);
        $result = app(ImobSysSandboxCheckoutClient::class)->status('ORDER1');
        $this->assertSame('payment_starting', $result['order']['state']);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'GET' && $request->url() === 'https://isolated.example.test/internal/checkout/ORDER1');
    }
}
