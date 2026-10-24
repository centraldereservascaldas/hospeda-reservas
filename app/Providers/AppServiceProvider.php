<?php

namespace App\Providers;

use App\Data\VerifiedGuest;
use App\Models\DirectBookingOrder;
use App\Observers\DirectBookingOrderObserver;
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
        DirectBookingOrder::observe(DirectBookingOrderObserver::class);

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

        RateLimiter::for('direct-booking-orders', function (Request $request): array {
            $guest = $request->attributes->get('verified_guest');

            $limits = [
                Limit::perMinute(120)->by('direct-booking-orders:ip:'.(string) $request->ip()),
            ];

            if ($guest instanceof VerifiedGuest) {
                $limits[] = Limit::perMinute(30)->by('direct-booking-orders:user:'.$guest->id);
            }

            return $limits;
        });
    }
}
