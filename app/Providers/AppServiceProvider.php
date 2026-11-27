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

        // The shared limit bounds enumeration across reservation codes and endpoints.
        RateLimiter::for('existing-reservation-global', fn (Request $request): Limit => Limit::perMinute(30)->by('existing-reservation:ip:'.(string) $request->ip())
        );

        foreach (['summary' => 10, 'checkout' => 5, 'recover' => 10, 'credential' => 10] as $purpose => $maximum) {
            RateLimiter::for('existing-reservation-'.$purpose, fn (Request $request): Limit => Limit::perMinute($maximum)->by('existing-reservation:'.$purpose.':ip:'.(string) $request->ip())
            );
        }

        RateLimiter::for('sofia-chat', fn (Request $request): Limit => Limit::perMinutes(10, 20)->by('sofia-chat:ip:'.(string) $request->ip()));

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
