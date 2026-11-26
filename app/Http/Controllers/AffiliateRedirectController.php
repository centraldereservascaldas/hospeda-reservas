<?php

namespace App\Http\Controllers;

use App\Services\AffiliateAttributionService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AffiliateRedirectController extends Controller
{
    public function __invoke(Request $request, string $token, AffiliateAttributionService $attribution): Response
    {
        $click = $attribution->recordClick($request, $token);
        if ($click === null) {
            abort(404);
        }

        $cookie = cookie(
            AffiliateAttributionService::COOKIE_NAME,
            $click['attributionId'],
            AffiliateAttributionService::WINDOW_DAYS * 24 * 60,
            '/',
            null,
            app()->environment('production'),
            true,
            false,
            'lax',
        );

        $canonicalBaseUrl = rtrim((string) config('app.url'), '/');

        return redirect()->to($canonicalBaseUrl.'/apartamento/'.rawurlencode($click['listingId']), 302)
            ->withCookie($cookie)
            ->header('Cache-Control', 'no-store, private')
            ->header('Referrer-Policy', 'no-referrer');
    }
}
