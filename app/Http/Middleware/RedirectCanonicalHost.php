<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RedirectCanonicalHost
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! in_array($request->method(), ['GET', 'HEAD'], true)
            || $request->is('api', 'api/*', 'external', 'external/*', 'up')
            || ! in_array(mb_strtolower($request->getHost()), config('legacy_redirects.hosts', []), true)) {
            return $next($request);
        }

        $canonical = parse_url((string) config('app.url'));
        if (! is_array($canonical) || ! isset($canonical['host'], $canonical['scheme'])
            || ! in_array($canonical['scheme'], ['http', 'https'], true)
            || mb_strtolower($canonical['host']) === mb_strtolower($request->getHost())) {
            return $next($request);
        }

        $origin = $canonical['scheme'].'://'.$canonical['host'];
        if (isset($canonical['port'])) {
            $origin .= ':'.$canonical['port'];
        }

        return redirect()->to($origin.$request->getRequestUri(), Response::HTTP_MOVED_PERMANENTLY);
    }
}
