<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BookingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_price_fallback_returns_existing_response_shape(): void
    {
        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
        $this->postJson('/api/price', ['listingIds' => ['JQ08G'], 'from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])
            ->assertOk()->assertJsonPath('success', true)->assertJsonPath('nights', 3)->assertJsonPath('source', 'local-fallback')->assertJsonStructure(['dailyRate', 'baseTotal', 'cleaningFee', 'serviceFee', 'total', 'breakdown']);
    }

    public function test_price_rejects_invalid_date_ranges(): void
    {
        $this->postJson('/api/price', ['listingId' => 'JQ08G', 'from' => '2026-11-12', 'to' => '2026-11-10', 'guests' => 2])->assertUnprocessable();
    }

    public function test_dated_search_fails_closed_when_live_availability_is_unavailable(): void
    {
        config(['services.stays.client_id' => 'client', 'services.stays.client_secret' => 'secret', 'services.stays.base_url' => 'https://crcn.stays.net/external/v1']);
        Http::fake(['*' => Http::response(['error' => 'unavailable'], 503)]);
        $this->postJson('/api/search', ['from' => '2026-11-10', 'to' => '2026-11-13', 'guests' => 2])->assertStatus(503)->assertJsonPath('code', 'availability_unavailable');
    }

    public function test_stays_status_reports_missing_credentials_without_exposing_secrets(): void
    {
        config(['services.stays.client_id' => '', 'services.stays.client_secret' => '']);
        $this->getJson('/api/stays/status')->assertStatus(503)->assertJsonPath('hasCredentials', false)->assertJsonMissingPath('clientSecret');
    }

    public function test_guest_routes_require_authentication(): void
    {
        $this->getJson('/api/my-reservations')->assertUnauthorized()->assertJsonPath('code', 'authentication_required');
        $this->postJson('/api/owner/access/request', [])->assertUnauthorized();
    }

    public function test_valid_supabase_session_can_request_owner_access_in_local_database(): void
    {
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key']);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']], 200)]);
        $this->withToken('valid-access-token')->postJson('/api/owner/access/request')->assertOk()->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('owner_access', ['user_id' => '575c8054-6646-443c-bf62-07945019a32f', 'status' => 'pending']);
    }

    public function test_owner_admin_routes_reject_non_admin_users(): void
    {
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']], 200)]);
        $this->withToken('valid-access-token')->getJson('/api/owner/admin/requests')->assertForbidden()->assertJsonPath('code', 'owner_admin_forbidden');
    }

    public function test_sofia_uses_deterministic_catalog_answer_without_openai_credentials(): void
    {
        config(['services.openai.api_key' => '']);
        $this->postJson('/api/sofia/chat', ['message' => 'Quero apartamentos para 4 pessoas com piscina'])->assertOk()->assertJsonPath('assistant', 'catalog')->assertJsonPath('totalFound', 19)->assertJsonCount(4, 'matchedProperties');
    }

    public function test_checkout_fails_closed_when_live_quote_has_no_valid_total(): void
    {
        $requestOrder = [];
        $this->fakeCheckoutRequests(['bookingPrice' => ['feesIncluded' => true]], $requestOrder);

        $this->withToken('valid-access-token')->postJson('/api/checkout', $this->checkoutPayload(3001))
            ->assertStatus(503)->assertJsonPath('code', 'quote_unavailable');

        $this->assertNotContains('POST /booking/clients', $requestOrder);
        $this->assertNotContains('POST /book-request', $requestOrder);
    }

    public function test_checkout_revalidates_quote_syncs_guest_and_only_then_creates_book_request(): void
    {
        $requestOrder = [];
        $this->fakeCheckoutRequests([
            '_idlisting' => 'JQ08G',
            'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true, 'fees' => []],
        ], $requestOrder);

        $this->withToken('valid-access-token')->postJson('/api/checkout', $this->checkoutPayload(3001))
            ->assertOk()->assertJsonPath('success', true)->assertJsonPath('quote.total', 3001);

        $this->assertDatabaseHas('guest_profiles', [
            'id' => '575c8054-6646-443c-bf62-07945019a32f',
            'stays_client_id' => 'stays-client-1',
        ]);
        $this->assertLessThan(array_search('POST /book-request', $requestOrder, true), array_search('POST /booking/clients', $requestOrder, true));
    }

    public function test_checkout_requires_client_quote_total(): void
    {
        $requestOrder = [];
        $this->fakeCheckoutRequests(['bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true]], $requestOrder);

        $this->withToken('valid-access-token')->postJson('/api/checkout', $this->checkoutPayload())
            ->assertUnprocessable()->assertJsonValidationErrors('quoteTotal');

        $this->assertSame(['GET /auth/v1/user'], $requestOrder);
    }

    public function test_checkout_requires_guest_sync_before_creating_book_request(): void
    {
        $requestOrder = [];
        $this->fakeCheckoutRequests([
            'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true, 'fees' => []],
        ], $requestOrder, clientLookupStatus: 503);

        $this->withToken('valid-access-token')->postJson('/api/checkout', $this->checkoutPayload(3001))
            ->assertStatus(503)->assertJsonPath('code', 'stays_client_sync_failed');

        $this->assertNotContains('POST /book-request', $requestOrder);
    }

    public function test_checkout_returns_new_quote_without_syncing_or_creating_a_book_request(): void
    {
        $requestOrder = [];
        $this->fakeCheckoutRequests([
            'bookingPrice' => ['mainCurrency' => 'BRL', '_mctotal' => ['BRL' => 3001], 'feesIncluded' => true, 'fees' => []],
        ], $requestOrder);

        $this->withToken('valid-access-token')->postJson('/api/checkout', $this->checkoutPayload(2900))
            ->assertStatus(409)->assertJsonPath('code', 'quote_changed')->assertJsonPath('quote.total', 3001);

        $this->assertNotContains('POST /booking/clients', $requestOrder);
        $this->assertNotContains('POST /book-request', $requestOrder);
    }

    private function checkoutPayload(?float $quoteTotal = null): array
    {
        return array_filter([
            'listingId' => 'JQ08G',
            'from' => '2026-11-10',
            'to' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0, 'pets' => 0],
            'quoteTotal' => $quoteTotal,
        ], fn (mixed $value): bool => $value !== null);
    }

    private function fakeCheckoutRequests(array $quote, array &$requestOrder, int $clientLookupStatus = 200): void
    {
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.base_url' => 'https://crcn.stays.net/external/v1',
        ]);
        Http::fake(function (ClientRequest $request) use ($quote, &$requestOrder, $clientLookupStatus) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            $requestOrder[] = $request->method().' '.str_replace('/external/v1', '', (string) $path);

            return match (true) {
                str_ends_with((string) $path, '/auth/v1/user') => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']], 200),
                str_ends_with((string) $path, '/booking/search-listings') => Http::response([['id' => 'JQ08G']], 200),
                str_ends_with((string) $path, '/booking/calculate-price') => Http::response([$quote], 200),
                str_ends_with((string) $path, '/booking/clients') && $request->method() === 'GET' => Http::response([], $clientLookupStatus),
                str_ends_with((string) $path, '/booking/clients') && $request->method() === 'POST' => Http::response(['_id' => 'stays-client-1'], 201),
                str_ends_with((string) $path, '/book-request') => Http::response(['redirectUrl' => 'https://crcn.stays.net/checkout/123'], 200),
                default => Http::response([], 404),
            };
        });
    }
}
