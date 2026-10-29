<?php

namespace Tests\Feature\Services\Payments;

use App\Services\Payments\CieloEcommerceClient;
use App\Services\Payments\CieloSilentOrderPostClient;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CieloSandboxClientsTest extends TestCase
{
    #[DataProvider('blockedProductionCases')]
    public function test_production_requests_are_blocked_without_all_explicit_gates(array $overrides, string $runtime): void
    {
        Http::preventStrayRequests();
        $this->configureProductionFixtures();
        config($overrides);
        $this->app->detectEnvironment(fn () => $runtime);

        try {
            app(CieloEcommerceClient::class)->createCardPayment('123e4567-e89b-12d3-a456-426614174000', 'order123', '12.00', 'BRL', 'Guest', '123');
            $this->fail('Blocked production configuration must not send a payment.');
        } catch (RuntimeException) {
            Http::assertNothingSent();
        }
    }

    public static function blockedProductionCases(): array
    {
        return [
            'default production gate off' => [['services.cielo.production.enabled' => false], 'production'],
            'live payments off' => [['direct-booking.live_payments_enabled' => false], 'production'],
            'checkout off' => [['direct-booking.enabled' => false], 'production'],
            'payment off' => [['direct-booking.payments_enabled' => false], 'production'],
            'confirmation off' => [['direct-booking.confirmation_enabled' => false], 'production'],
            'local runtime' => [[], 'local'],
            'testing runtime' => [[], 'testing'],
            'invalid environment' => [['services.cielo.direct_environment' => 'invalid'], 'production'],
            'no production credentials despite sandbox configured' => [['services.cielo.production.merchant_key' => null, 'services.cielo.merchant_key' => 'sandbox-only'], 'production'],
        ];
    }

    public function test_production_contract_uses_only_production_credentials_and_endpoints_with_http_fakes(): void
    {
        Http::preventStrayRequests();
        $this->configureProductionFixtures();
        Http::fake([
            'https://api.cieloecommerce.cielo.com.br/1/sales/' => Http::response(['Payment' => ['Status' => 2]], 201),
            'https://apiquery.cieloecommerce.cielo.com.br/1/sales/*' => Http::response(['Payment' => ['Status' => 2]]),
            'https://auth.braspag.com.br/oauth2/token' => Http::response(['access_token' => 'production-oauth-fixture']),
            'https://transaction.pagador.com.br/post/api/public/v2/accesstoken' => Http::response(['AccessToken' => 'production-browser-fixture']),
        ]);

        $client = app(CieloEcommerceClient::class);
        $client->createCardPayment('123e4567-e89b-12d3-a456-426614174000', 'order123', '12.00', 'BRL', 'Guest', '123');
        $client->findPaymentById('123e4567-e89b-12d3-a456-426614174000');
        $this->assertSame('production-browser-fixture', app(CieloSilentOrderPostClient::class)->createBrowserAccessToken());
        Http::assertSentCount(4);
        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://api.cieloecommerce.cielo.com.br/1/sales/'
            && $request->hasHeader('MerchantId', 'production-merchant-fixture')
            && $request->hasHeader('MerchantKey', 'production-key-fixture')
            && ! isset($request->data()['Payment']['Provider'])
            && $request->data()['Payment']['Amount'] === 1200
            && $request->data()['Payment']['CreditCard'] === ['PaymentToken' => '123e4567-e89b-12d3-a456-426614174000']);
        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://auth.braspag.com.br/oauth2/token'
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('production-client-fixture:production-secret-fixture')));
        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://transaction.pagador.com.br/post/api/public/v2/accesstoken'
            && $request->hasHeader('MerchantId', 'production-merchant-fixture'));
    }

    private function configureProductionFixtures(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config([
            'services.cielo.direct_environment' => 'production',
            'services.cielo.production.enabled' => true,
            'services.cielo.production.sop_enabled' => true,
            'services.cielo.production.merchant_id' => 'production-merchant-fixture',
            'services.cielo.production.merchant_key' => 'production-key-fixture',
            'services.cielo.production.sop_client_id' => 'production-client-fixture',
            'services.cielo.production.sop_client_secret' => 'production-secret-fixture',
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.live_payments_enabled' => true,
        ]);
    }

    public function test_turning_off_new_charges_keeps_existing_payment_queries_available(): void
    {
        Http::preventStrayRequests();
        $this->configureProductionFixtures();
        config(['direct-booking.live_payments_enabled' => false, 'direct-booking.payments_enabled' => false]);
        Http::fake(['https://apiquery.cieloecommerce.cielo.com.br/1/sales/*' => Http::response(['Payment' => ['Status' => 2]])]);
        $result = app(CieloEcommerceClient::class)->findPaymentById('123e4567-e89b-12d3-a456-426614174000');
        $this->assertSame(2, $result['Payment']['Status']);
        Http::assertSentCount(1);
    }

    public function test_payment_sends_cents_and_payment_token_only_to_the_sandbox(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => Http::response(['Payment' => ['Status' => 2]], 201),
        ]);
        config([
            'services.cielo.enabled' => true,
            'services.cielo.merchant_id' => 'merchant-id-sentinel',
            'services.cielo.merchant_key' => 'merchant-key-sentinel',
        ]);

        $payment = app(CieloEcommerceClient::class)->createCardPayment(
            '123e4567-e89b-12d3-a456-426614174000',
            'order123',
            '1250.50',
            'BRL',
            'Guest Name',
            '123.456.789-00',
        );

        $this->assertSame(['Payment' => ['Status' => 2]], $payment);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/'
            && $request->hasHeader('MerchantId', 'merchant-id-sentinel')
            && $request->hasHeader('MerchantKey', 'merchant-key-sentinel')
            && $request->data()['Payment']['Amount'] === 125050
            && $request->data()['Payment']['CreditCard'] === ['PaymentToken' => '123e4567-e89b-12d3-a456-426614174000']
            && ! array_key_exists('CardToken', $request->data()['Payment']['CreditCard'])
            && ! array_key_exists('SecurityCode', $request->data()['Payment']['CreditCard'])
        );
    }

    public function test_raw_pan_and_cvv_are_rejected_without_sending_a_request(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => Http::response([])]);
        config(['services.cielo.enabled' => true, 'services.cielo.merchant_id' => 'id', 'services.cielo.merchant_key' => 'key']);

        try {
            app(CieloEcommerceClient::class)->createCardPayment('4111111111111111', 'order123', '12.00', 'BRL', 'Guest', '123');
            $this->fail('Raw card numbers must be rejected.');
        } catch (InvalidArgumentException $exception) {
            $this->assertSame('A valid one-time Cielo PaymentToken is required.', $exception->getMessage());
        }

        Http::assertNothingSent();
    }

    public function test_payment_rejects_disabled_or_non_sandbox_configuration_without_request(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => Http::response([])]);
        config(['services.cielo.enabled' => false, 'services.cielo.merchant_id' => 'id', 'services.cielo.merchant_key' => 'key']);

        try {
            app(CieloEcommerceClient::class)->createCardPayment('123e4567-e89b-12d3-a456-426614174000', 'order123', '12.00', 'BRL', 'Guest', '123');
            $this->fail('Disabled Cielo sandbox must reject payments.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Cielo direct credentials are not enabled.', $exception->getMessage());
        }

        Http::assertNothingSent();
    }

    public function test_payment_query_uses_query_sandbox_and_merchant_authentication(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales?merchantOrderId=order123' => Http::response([['PaymentId' => '123e4567-e89b-12d3-a456-426614174000']]),
            'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174000' => Http::response(['PaymentId' => '123e4567-e89b-12d3-a456-426614174000']),
        ]);
        config(['services.cielo.enabled' => true, 'services.cielo.merchant_id' => 'merchant-id-sentinel', 'services.cielo.merchant_key' => 'merchant-key-sentinel']);

        $payment = app(CieloEcommerceClient::class)->findPaymentByMerchantOrderId('order123');

        $this->assertSame(['PaymentId' => '123e4567-e89b-12d3-a456-426614174000'], $payment);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'GET'
            && str_starts_with($request->url(), 'https://apiquerysandbox.cieloecommerce.cielo.com.br/')
            && $request->hasHeader('MerchantId', 'merchant-id-sentinel')
            && $request->hasHeader('MerchantKey', 'merchant-key-sentinel')
        );
    }

    public function test_silent_order_post_returns_browser_token_without_exposing_client_credentials(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://authsandbox.braspag.com.br/oauth2/token' => Http::response(['access_token' => 'oauth-access-token-sentinel']),
            'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken' => Http::response(['AccessToken' => 'browser-access-token-sentinel']),
        ]);
        config([
            'services.cielo.enabled' => true,
            'services.cielo.sop_enabled' => true,
            'services.cielo.merchant_id' => 'merchant-id-sentinel',
            'services.cielo.merchant_key' => 'merchant-key-sentinel',
            'services.cielo.sop_client_id' => 'client-id-sentinel',
            'services.cielo.sop_client_secret' => 'client-secret-sentinel',
        ]);

        $token = app(CieloSilentOrderPostClient::class)->createBrowserAccessToken();

        $this->assertSame('browser-access-token-sentinel', $token);
        $this->assertStringNotContainsString('client-secret-sentinel', $token);
        Http::assertSent(fn (ClientRequest $request): bool => $request->url() === 'https://authsandbox.braspag.com.br/oauth2/token'
            && $request->method() === 'POST'
            && $request->data()['grant_type'] === 'client_credentials'
            && $request->hasHeader('Authorization')
        );
        Http::assertSent(fn (ClientRequest $request): bool => $request->url() === 'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken'
            && $request->method() === 'POST'
            && $request->hasHeader('Authorization', 'Bearer oauth-access-token-sentinel')
            && $request->hasHeader('MerchantId', 'merchant-id-sentinel')
        );
    }

    public function test_silent_order_post_disabled_configuration_fails_without_request(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://authsandbox.braspag.com.br/oauth2/token' => Http::response([])]);
        config(['services.cielo.enabled' => true, 'services.cielo.sop_enabled' => false]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Cielo Silent Order Post is not enabled for this environment.');

        app(CieloSilentOrderPostClient::class)->createBrowserAccessToken();
    }
}
