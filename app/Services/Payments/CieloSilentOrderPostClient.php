<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class CieloSilentOrderPostClient
{
    public function __construct(private readonly CieloEcommerceClient $ecommerce, private readonly CieloDirectConfiguration $configuration) {}

    public function isConfigured(): bool
    {
        return (bool) $this->configuration->value('sop_enabled')
            && $this->ecommerce->isConfigured()
            && $this->configuredValue('sop_client_id') !== null
            && $this->configuredValue('sop_client_secret') !== null;
    }

    public function createBrowserAccessToken(): string
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Cielo Silent Order Post is not enabled for this environment.');
        }

        $clientId = $this->configuredValue('sop_client_id');
        $clientSecret = $this->configuredValue('sop_client_secret');
        $oauthResponse = Http::asForm()
            ->acceptJson()
            ->withBasicAuth((string) $clientId, (string) $clientSecret)
            ->connectTimeout(3)
            ->timeout(10)
            ->post($this->configuration->endpoint('oauth'), ['grant_type' => 'client_credentials'])
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
            ->post($this->configuration->endpoint('sop'))
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
        $value = $this->configuration->value($key);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
