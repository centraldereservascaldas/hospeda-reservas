<?php

namespace App\Http\Middleware;

use App\Data\VerifiedGuest;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireOwnerAdmin
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string $scope = 'admin'): Response
    {
        $admins = config('services.hospeda.owner_admin_emails', []);
        $emails = $scope === 'reviewer'
            ? array_merge($admins, config('services.hospeda.owner_reviewer_emails', []))
            : $admins;
        if ($emails === []) {
            return response()->json(['success' => false, 'code' => 'owner_admin_not_configured', 'message' => 'A área administrativa ainda não foi configurada.'], 503);
        }

        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'authentication_required', 'message' => 'Entre na sua conta para continuar.'], 401);
        }
        if (! in_array($guest->email, $emails, true)) {
            return response()->json(['success' => false, 'code' => 'owner_admin_forbidden', 'message' => 'Acesso restrito à equipe autorizada.'], 403);
        }

        return $next($request);
    }
}
