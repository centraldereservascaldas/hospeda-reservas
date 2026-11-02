<?php

namespace App\Services\Payments;

class CieloDirectConfiguration
{
    private const DOCUMENTED_SANDBOX_SOP_CLIENT_ID = '6631016d-72e6-4db1-a2d2-9cbe61464925';

    private const DOCUMENTED_SANDBOX_SOP_MERCHANT_ID = '832ce400-9c97-4fe7-9d4f-0928675e36cd';

    public static function isProvider(mixed $provider): bool
    {
        return in_array($provider, ['cielo_sandbox', 'cielo'], true);
    }

    public function environment(): string
    {
        return (string) config('services.cielo.direct_environment', 'sandbox');
    }

    public function provider(): string
    {
        return $this->environment() === 'production' ? 'cielo' : 'cielo_sandbox';
    }

    public function isAllowed(): bool
    {
        if ($this->environment() === 'sandbox') {
            return app()->environment(['local', 'testing']);
        }

        return $this->environment() === 'production'
            && app()->isProduction()
            && (bool) config('services.cielo.production.enabled', false);
    }

    public function canCharge(): bool
    {
        return $this->isAllowed()
            && ($this->environment() === 'sandbox'
                || ((bool) config('direct-booking.live_payments_enabled', false)
                    && (bool) config('direct-booking.enabled', false)
                    && (bool) config('direct-booking.payments_enabled', false)
                    && (bool) config('direct-booking.confirmation_enabled', false)));
    }

    public function value(string $key): mixed
    {
        $prefix = $this->environment() === 'production' ? 'services.cielo.production.' : 'services.cielo.';

        return config($prefix.$key);
    }

    public function sandboxSopMerchantIsCompatible(): bool
    {
        if ($this->environment() !== 'sandbox') {
            return true;
        }

        $clientId = $this->value('sop_client_id');
        if (! is_string($clientId) || ! hash_equals(self::DOCUMENTED_SANDBOX_SOP_CLIENT_ID, $clientId)) {
            return true;
        }

        $merchantId = $this->value('merchant_id');

        return is_string($merchantId) && hash_equals(self::DOCUMENTED_SANDBOX_SOP_MERCHANT_ID, $merchantId);
    }

    public function endpoint(string $purpose): string
    {
        $production = $this->environment() === 'production';

        return match ($purpose) {
            'transaction' => $production ? 'https://api.cieloecommerce.cielo.com.br' : 'https://apisandbox.cieloecommerce.cielo.com.br',
            'query' => $production ? 'https://apiquery.cieloecommerce.cielo.com.br' : 'https://apiquerysandbox.cieloecommerce.cielo.com.br',
            'oauth' => $production ? 'https://auth.braspag.com.br/oauth2/token' : 'https://authsandbox.braspag.com.br/oauth2/token',
            'sop' => $production ? 'https://transaction.pagador.com.br/post/api/public/v2/accesstoken' : 'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken',
            default => throw new \InvalidArgumentException('Unknown Cielo endpoint purpose.'),
        };
    }
}
