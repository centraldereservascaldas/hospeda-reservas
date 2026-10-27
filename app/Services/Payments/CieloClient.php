<?php

namespace App\Services\Payments;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class CieloClient
{
    /** @param array<string, mixed> $payload
     * @return array{checkoutUrl: string, response: array<string, mixed>}
     */
    public function createCheckoutPage(array $payload): array
    {
        $response = Http::acceptJson()
            ->asJson()
            ->withHeader('MerchantId', $this->requiredConfig('services.cielo.merchant_id'))
            ->connectTimeout(3)
            ->timeout(15)
            ->post('https://cieloecommerce.cielo.com.br/api/public/v1/orders/', $payload)
            ->throw()
            ->json();

        if (! is_array($response)) {
            throw new RuntimeException('Cielo Checkout returned an invalid response.');
        }

        $checkoutUrl = data_get($response, 'CheckoutUrl')
            ?? data_get($response, 'checkoutUrl')
            ?? data_get($response, 'settings.checkoutUrl')
            ?? data_get($response, 'url');
        if (! is_string($checkoutUrl) || ! $this->isAllowedCheckoutUrl($checkoutUrl)) {
            throw new RuntimeException('Cielo Checkout returned an invalid checkout URL.');
        }

        return ['checkoutUrl' => $checkoutUrl, 'response' => $response];
    }

    /** @return array<string, mixed> */
    public function getCheckoutOrder(string $checkoutOrderNumber): array
    {
        $clientId = $this->requiredConfig('services.cielo.sop_client_id');
        $clientSecret = $this->requiredConfig('services.cielo.sop_client_secret');
        $tokenResponse = Http::acceptJson()
            ->withBasicAuth($clientId, $clientSecret)
            ->connectTimeout(3)
            ->timeout(10)
            ->post('https://cieloecommerce.cielo.com.br/api/public/v2/token')
            ->throw()
            ->json();
        $accessToken = is_array($tokenResponse) ? ($tokenResponse['access_token'] ?? null) : null;
        if (! is_string($accessToken) || trim($accessToken) === '') {
            throw new RuntimeException('Cielo Checkout access token response is invalid.');
        }

        $response = Http::acceptJson()
            ->withToken($accessToken)
            ->connectTimeout(3)
            ->timeout(10)
            ->get('https://cieloecommerce.cielo.com.br/api/public/v2/orders/'.rawurlencode($checkoutOrderNumber))
            ->throw()
            ->json();

        if (! is_array($response)) {
            throw new RuntimeException('Cielo Checkout order query response is invalid.');
        }

        return $response;
    }

    /** @return array<string, mixed> */
    public function createSopAccessToken(): array
    {
        $clientId = $this->requiredConfig('services.cielo.sop_client_id');
        $clientSecret = $this->requiredConfig('services.cielo.sop_client_secret');
        $merchantId = $this->requiredConfig('services.cielo.merchant_id');
        $sandbox = config('services.cielo.environment', 'sandbox') !== 'production';

        $oauth = Http::acceptJson()
            ->asForm()
            ->withBasicAuth($clientId, $clientSecret)
            ->connectTimeout(3)
            ->timeout(10)
            ->post($sandbox ? 'https://authsandbox.braspag.com.br/oauth2/token' : 'https://auth.braspag.com.br/oauth2/token', [
                'grant_type' => 'client_credentials',
            ])
            ->throw()
            ->json();

        $accessToken = is_array($oauth) ? ($oauth['access_token'] ?? null) : null;
        if (! is_string($accessToken) || trim($accessToken) === '') {
            throw new RuntimeException('Cielo OAuth returned an invalid access token.');
        }

        $response = Http::acceptJson()
            ->withToken($accessToken)
            ->withHeader('MerchantId', $merchantId)
            ->connectTimeout(3)
            ->timeout(10)
            ->post($sandbox
                ? 'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken'
                : 'https://transaction.pagador.com.br/post/api/public/v2/accesstoken');

        $response->throw();
        $data = $response->json();

        if (! is_array($data) || ! is_string($data['AccessToken'] ?? null) || ! is_string($data['ExpiresIn'] ?? null)) {
            throw new RuntimeException('Cielo SOP returned an invalid access token response.');
        }

        return [
            'accessToken' => $data['AccessToken'],
            'expiresAt' => $data['ExpiresIn'],
            'environment' => $sandbox ? 'sandbox' : 'production',
        ];
    }

    /** @return array<string, mixed> */
    public function createCreditCardPayment(
        string $orderId,
        string $paymentToken,
        string $cardBrand,
        string $holderName,
        int $amountInCents,
        int $installments,
    ): array {
        $brand = mb_strtolower(trim($cardBrand)) === 'jcb'
            ? 'JCB'
            : ucfirst(mb_strtolower(trim($cardBrand)));
        if (! in_array($brand, ['Visa', 'Master', 'Amex', 'Elo', 'Diners', 'Discover', 'JCB'], true)) {
            throw new RuntimeException('Unsupported Cielo card brand.');
        }

        $payload = [
            'MerchantOrderId' => $orderId,
            'Customer' => ['Name' => mb_substr(trim($holderName), 0, 255)],
            'Payment' => [
                'Type' => 'CreditCard',
                'Amount' => $amountInCents,
                'Installments' => $installments,
                'Capture' => true,
                'CreditCard' => [
                    'PaymentToken' => $paymentToken,
                    'Brand' => $brand,
                    'Holder' => mb_substr(Str::ascii(trim($holderName)), 0, 25),
                ],
            ],
        ];

        $response = $this->transactionRequest()
            ->post('/1/sales/', $payload)
            ->throw();
        $data = $response->json();

        if (! is_array($data) || ! is_array($data['Payment'] ?? null)) {
            throw new RuntimeException('Cielo returned an invalid payment response.');
        }

        return $data;
    }

    /** @return array<string, mixed> */
    public function getPayment(string $paymentId): array
    {
        $response = $this->queryRequest()
            ->get('/1/sales/'.rawurlencode($paymentId))
            ->throw();
        $data = $response->json();

        if (! is_array($data) || ! is_array($data['Payment'] ?? null)) {
            throw new RuntimeException('Cielo returned an invalid payment query response.');
        }

        return $data;
    }

    private function transactionRequest(): PendingRequest
    {
        return Http::baseUrl((string) config('services.cielo.transaction_base_url'))
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'MerchantId' => $this->requiredConfig('services.cielo.merchant_id'),
                'MerchantKey' => $this->requiredConfig('services.cielo.merchant_key'),
                'RequestId' => (string) str()->uuid(),
            ])
            ->connectTimeout(3)
            ->timeout(15);
    }

    private function queryRequest(): PendingRequest
    {
        return Http::baseUrl((string) config('services.cielo.query_base_url'))
            ->acceptJson()
            ->withHeaders([
                'MerchantId' => $this->requiredConfig('services.cielo.merchant_id'),
                'MerchantKey' => $this->requiredConfig('services.cielo.merchant_key'),
            ])
            ->connectTimeout(3)
            ->timeout(10);
    }

    private function requiredConfig(string $key): string
    {
        $value = config($key);
        if (! is_string($value) || trim($value) === '') {
            throw new RuntimeException('Required Cielo configuration is missing.');
        }

        return trim($value);
    }

    private function isAllowedCheckoutUrl(string $checkoutUrl): bool
    {
        $parts = parse_url($checkoutUrl);
        if (! is_array($parts) || ($parts['scheme'] ?? null) !== 'https' || isset($parts['user']) || isset($parts['pass'])) {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));

        return in_array($host, ['cieloecommerce.cielo.com.br', 'cielolink.com.br', 'www.cielolink.com.br'], true);
    }
}
