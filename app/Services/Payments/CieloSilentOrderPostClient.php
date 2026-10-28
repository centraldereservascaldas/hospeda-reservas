<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class CieloSilentOrderPostClient
{
    private const AUTH_URL = 'https://authsandbox.braspag.com.br/oauth2/token';

    private const ACCESS_TOKEN_URL = 'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken';

    public function __construct(private readonly CieloEcommerceClient $ecommerce) {}

    public function isConfigured(): bool
    {
        return (bool) config('services.cielo.sop_enabled', false)
            && $this->ecommerce->isConfigured()
            && $this->configuredValue('services.cielo.sop_client_id') !== null
            && $this->configuredValue('services.cielo.sop_client_secret') !== null;
    }

    public function createBrowserAccessToken(): string
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Cielo Silent Order Post sandbox is not enabled.');
        }

        $clientId = $this->configuredValue('services.cielo.sop_client_id');
        $clientSecret = $this->configuredValue('services.cielo.sop_client_secret');
        $oauthResponse = Http::asForm()
            ->acceptJson()
            ->withBasicAuth((string) $clientId, (string) $clientSecret)
            ->connectTimeout(3)
            ->timeout(10)
            ->post(self::AUTH_URL, ['grant_type' => 'client_credentials'])
            ->throw()
            ->json();

        $oauthAccessToken = is_array($oauthResponse) ? ($oauthResponse['access_token'] ?? null) : null;
        if (! is_string($oauthAccessToken) || trim($oauthAccessToken) === '') {
            throw new RuntimeException('Cielo did not return an OAuth access token.');
        }

        $sopResponse = Http::acceptJson()
            ->withToken($oauthAccessToken)
            ->withHeaders(['MerchantId' => $this->ecommerce->merchantId()])
            ->connectTimeout(3)
            ->timeout(10)
            ->post(self::ACCESS_TOKEN_URL)
            ->throw()
            ->json();

        $browserAccessToken = is_array($sopResponse) ? ($sopResponse['AccessToken'] ?? null) : null;
        if (! is_string($browserAccessToken) || trim($browserAccessToken) === '') {
            throw new RuntimeException('Cielo did not return a Silent Order Post access token.');
        }

        return trim($browserAccessToken);
    }

    private function configuredValue(string $key): ?string
    {
        $value = config($key);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
