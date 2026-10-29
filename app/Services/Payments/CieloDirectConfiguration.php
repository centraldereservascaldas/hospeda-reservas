<?php

namespace App\Services\Payments;

class CieloDirectConfiguration
{
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
