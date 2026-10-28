<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StaysHostedCheckoutTest extends TestCase
{
    /** @return array<string, mixed> */
    private function payload(): array
    {
        return [
            'listingId' => 'LG02J',
            'from' => '2026-11-12',
            'to' => '2026-11-14',
            'guests' => 2,
            'quoteTotal' => 430,
            'guest' => ['fullName' => 'Cliente Exemplo', 'email' => 'cliente@example.test'],
        ];
    }

    private function fakeStays(string $redirectUrl = 'https://www.centraldereservascaldas.com.br/customer/pt/booking?token=abc'): void
    {
        Http::preventStrayRequests();
        Http::fake([
            '*/content/listings/LG02J' => Http::response([
                'id' => 'LG02J',
                '_id' => 'stays-internal-listing-id',
                '_i_maxGuests' => 4,
            ]),
            '*/booking/search-listings' => Http::response([[
                'id' => 'LG02J',
                '_id' => 'stays-internal-listing-id',
            ]]),
            '*/booking/calculate-price' => Http::response([[
                '_idlisting' => 'stays-internal-listing-id',
                '_mctotal' => ['BRL' => 430],
                'feesIncluded' => true,
                'fees' => [],
                'mainCurrency' => 'BRL',
            ]]),
            '*/book-request' => Http::response(['redirectUrl' => $redirectUrl]),
        ]);
    }

    public function test_hosted_checkout_returns_a_stays_url_with_the_verified_request_payload(): void
    {
        config([
            'services.stays.hosted_checkout_enabled' => true,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);
        $this->fakeStays();

        $this->postJson('/api/stays-checkout', $this->payload())
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('checkoutUrl', 'https://www.centraldereservascaldas.com.br/customer/pt/booking?token=abc')
            ->assertHeader('Cache-Control', 'no-store, private');

        Http::assertSent(fn (ClientRequest $request): bool => str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/book-request')
            && $request['aptid'] === 'LG02J'
            && $request['persons'] === 2
            && $request['client']['email'] === 'cliente@example.test'
            && $request['client']['fName'] === 'Cliente'
            && $request['client']['lName'] === 'Exemplo');
    }

    public function test_hosted_checkout_rejects_a_changed_price_before_book_request(): void
    {
        config([
            'services.stays.hosted_checkout_enabled' => true,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);
        $this->fakeStays();
        $payload = $this->payload();
        $payload['quoteTotal'] = 400;

        $this->postJson('/api/stays-checkout', $payload)
            ->assertConflict()
            ->assertJsonPath('code', 'quote_changed');
        Http::assertNotSent(fn (ClientRequest $request): bool => str_ends_with(parse_url($request->url(), PHP_URL_PATH), '/book-request'));
    }

    public function test_hosted_checkout_rejects_an_external_redirect_url(): void
    {
        config([
            'services.stays.hosted_checkout_enabled' => true,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);
        $this->fakeStays('https://stays.net.evil.example/collect');

        $this->postJson('/api/stays-checkout', $this->payload())
            ->assertStatus(502)
            ->assertJsonPath('code', 'stays_checkout_failed')
            ->assertJsonMissingPath('checkoutUrl');
    }

    public function test_hosted_checkout_requires_valid_guest_data_without_calling_stays(): void
    {
        Http::preventStrayRequests();

        $this->postJson('/api/stays-checkout', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['listingId', 'from', 'to', 'guests', 'quoteTotal', 'guest']);

        $payload = $this->payload();
        $payload['guest']['fullName'] = 'Cliente';
        $this->postJson('/api/stays-checkout', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('guest.fullName');
        Http::assertNothingSent();
    }

    public function test_hosted_checkout_is_disabled_by_default_without_calling_stays(): void
    {
        config([
            'services.stays.hosted_checkout_enabled' => false,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);
        Http::preventStrayRequests();

        $this->postJson('/api/stays-checkout', $this->payload())
            ->assertStatus(503)
            ->assertJsonPath('code', 'checkout_disabled');
        Http::assertNothingSent();
    }

    public function test_readiness_is_safe_and_does_not_call_stays(): void
    {
        Http::preventStrayRequests();
        config([
            'services.stays.hosted_checkout_enabled' => false,
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
        ]);

        $this->getJson('/api/stays-checkout/readiness')
            ->assertOk()
            ->assertJson([
                'ready' => false,
                'code' => 'checkout_disabled',
                'message' => 'O checkout da Stays ainda não está habilitado neste ambiente.',
            ])
            ->assertJsonMissing(['client', 'secret'])
            ->assertHeader('Cache-Control', 'no-store, private');

        config(['services.stays.hosted_checkout_enabled' => true]);
        $this->getJson('/api/stays-checkout/readiness')
            ->assertOk()
            ->assertJsonPath('ready', true)
            ->assertJsonPath('code', null);

        Http::assertNothingSent();
    }
}
