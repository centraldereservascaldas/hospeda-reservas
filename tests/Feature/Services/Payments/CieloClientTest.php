<?php

namespace Tests\Feature\Services\Payments;

use App\Services\Payments\CieloClient;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CieloClientTest extends TestCase
{
    public function test_it_creates_a_checkout_page_using_the_merchant_id_only(): void
    {
        config(['services.cielo.checkout_merchant_id' => 'merchant-id']);
        Http::preventStrayRequests();
        Http::fake([
            'https://cieloecommerce.cielo.com.br/api/public/v1/orders/' => Http::response([
                'CheckoutUrl' => 'https://cieloecommerce.cielo.com.br/checkout/test-page',
            ], 201),
        ]);

        $result = (new CieloClient)->createCheckoutPage([
            'OrderNumber' => 'CRCNABCDEFGHIJKLMNOP',
            'Cart' => ['Items' => [['Name' => 'Hospedagem', 'UnitPrice' => 12500, 'Quantity' => 1, 'Type' => 'Service']]],
        ]);

        $this->assertSame('https://cieloecommerce.cielo.com.br/checkout/test-page', $result['checkoutUrl']);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://cieloecommerce.cielo.com.br/api/public/v1/orders/'
            && $request->hasHeader('MerchantId', 'merchant-id')
            && $request->data()['OrderNumber'] === 'CRCNABCDEFGHIJKLMNOP'
            && ! $request->hasHeader('MerchantKey')
            && ! $request->hasHeader('Authorization')
        );
    }

    public function test_it_rejects_a_checkout_url_outside_cielo_domains(): void
    {
        config(['services.cielo.checkout_merchant_id' => 'merchant-id']);
        Http::preventStrayRequests();
        Http::fake([
            'https://cieloecommerce.cielo.com.br/api/public/v1/orders/' => Http::response([
                'CheckoutUrl' => 'https://attacker.example/fake-checkout',
            ], 201),
        ]);

        try {
            (new CieloClient)->createCheckoutPage(['OrderNumber' => 'CRCNABCDEFGHIJKLMNOP']);
            $this->fail('A non-Cielo checkout URL must be rejected.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Cielo Checkout returned an invalid checkout URL.', $exception->getMessage());
        }
    }

    public function test_it_uses_link_api_credentials_to_query_the_authoritative_checkout_order(): void
    {
        config([
            'services.cielo.checkout_sop_client_id' => 'link-client-id',
            'services.cielo.checkout_sop_client_secret' => 'link-client-secret',
        ]);
        Http::preventStrayRequests();
        Http::fake([
            'https://cieloecommerce.cielo.com.br/api/public/v2/token' => Http::response(['access_token' => 'link-access-token'], 200),
            'https://cieloecommerce.cielo.com.br/api/public/v2/orders/checkout-order-123' => Http::response([
                'order_number' => 'CRCNABCDEFGHIJKLMNOP',
                'checkout_cielo_order_number' => 'checkout-order-123',
                'amount' => 12500,
                'payment' => ['status' => 'Paid'],
            ], 200),
        ]);

        $order = (new CieloClient)->getCheckoutOrder('checkout-order-123');

        $this->assertSame('Paid', $order['payment']['status']);
        Http::assertSent(fn (ClientRequest $request): bool => $request->url() === 'https://cieloecommerce.cielo.com.br/api/public/v2/orders/checkout-order-123'
            && $request->method() === 'GET'
            && $request->hasHeader('Authorization', 'Bearer link-access-token')
        );
    }

    public function test_it_requests_an_oauth_token_then_a_sop_access_token(): void
    {
        config([
            'services.cielo.checkout_environment' => 'sandbox',
            'services.cielo.checkout_sop_client_id' => 'sop-client-id',
            'services.cielo.checkout_sop_client_secret' => 'sop-client-secret',
            'services.cielo.checkout_merchant_id' => 'merchant-id',
        ]);
        Http::preventStrayRequests();
        Http::fake([
            'https://authsandbox.braspag.com.br/oauth2/token' => Http::response(['access_token' => 'oauth-token'], 200),
            'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken' => Http::response([
                'AccessToken' => 'sop-access-token',
                'ExpiresIn' => '2026-10-27T13:00:00',
            ], 201),
        ]);

        $credentials = (new CieloClient)->createSopAccessToken();

        $this->assertSame('sop-access-token', $credentials['accessToken']);
        $this->assertSame('sandbox', $credentials['environment']);
        Http::assertSent(fn (ClientRequest $request): bool => $request->url() === 'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken'
            && $request->method() === 'POST'
            && $request->hasHeader('Authorization', 'Bearer oauth-token')
            && $request->hasHeader('MerchantId', 'merchant-id')
        );
    }

    public function test_it_authorizes_a_credit_card_using_only_the_sop_payment_token(): void
    {
        config([
            'services.cielo.checkout_transaction_base_url' => 'https://apisandbox.cieloecommerce.cielo.com.br',
            'services.cielo.checkout_merchant_id' => 'merchant-id',
            'services.cielo.checkout_merchant_key' => 'merchant-key',
        ]);
        Http::preventStrayRequests();
        Http::fake([
            'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' => Http::response([
                'MerchantOrderId' => 'order-reference',
                'Payment' => ['PaymentId' => 'payment-id', 'Status' => 2],
            ], 201),
        ]);

        $response = (new CieloClient)->createCreditCardPayment(
            'order-reference',
            'e74bd439-1906-4387-b6e3-403b7756a2b0',
            'Visa',
            'José da Silva',
            12500,
            3,
        );

        $this->assertSame('payment-id', $response['Payment']['PaymentId']);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/'
            && $request->data()['MerchantOrderId'] === 'order-reference'
            && $request->data()['Payment']['Amount'] === 12500
            && $request->data()['Payment']['CreditCard']['PaymentToken'] === 'e74bd439-1906-4387-b6e3-403b7756a2b0'
            && $request->data()['Payment']['CreditCard']['Holder'] === 'Jose da Silva'
            && ! array_key_exists('CardNumber', $request->data()['Payment']['CreditCard'])
            && ! array_key_exists('SecurityCode', $request->data()['Payment']['CreditCard'])
        );
    }
}
