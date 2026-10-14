<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\HttpFoundation\Response;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('checkout-resume', function (Request $request): array {
            $ip = (string) $request->ip();
            $reference = (string) $request->route('publicReference');

            return [
                Limit::perMinute(20)->by('checkout-resume:ip:'.$ip),
                Limit::perMinute(5)
                    ->by('checkout-resume:not-found:'.$ip.':'.$reference)
                    ->after(fn (Response $response): bool => $response->getStatusCode() === 404),
            ];
        });
    }
}
