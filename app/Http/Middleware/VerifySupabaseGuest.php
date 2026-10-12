<?php

namespace App\Http\Middleware;

use App\Data\VerifiedGuest;
use App\Services\SupabaseAuthClient;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifySupabaseGuest
{
    public function handle(Request $request, Closure $next): Response
    {
        $authorization = (string) $request->header('Authorization', '');
        $token = preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches) ? $matches[1] : '';

        if ($token === '') {
            return response()->json(['success' => false, 'code' => 'authentication_required', 'message' => 'Entre na sua conta para continuar.'], 401);
        }

        $result = app(SupabaseAuthClient::class)->getUser($token);
        if ($result['error'] === 'not_configured') {
            return response()->json(['success' => false, 'code' => 'auth_not_configured', 'message' => 'O acesso de hóspedes ainda não está configurado.'], 503);
        }
        if ($result['error'] === 'unavailable') {
            return response()->json(['success' => false, 'code' => 'auth_unavailable', 'message' => 'Não foi possível validar sua sessão agora.'], 503);
        }

        $user = $result['user'];
        if (! is_array($user)) {
            return response()->json(['success' => false, 'code' => 'invalid_session', 'message' => 'Sua sessão expirou. Entre novamente.'], 401);
        }
        if (empty($user['email_confirmed_at'])) {
            return response()->json(['success' => false, 'code' => 'email_not_confirmed', 'message' => 'Confirme seu e-mail antes de continuar.'], 403);
        }

        $metadata = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
        $fullName = trim((string) ($metadata['full_name'] ?? $metadata['name'] ?? ''));
        if (count(preg_split('/\s+/', $fullName, -1, PREG_SPLIT_NO_EMPTY) ?: []) < 2) {
            return response()->json(['success' => false, 'code' => 'profile_name_required', 'message' => 'Atualize seu nome completo antes de reservar.'], 403);
        }

        $request->attributes->set('verified_guest', new VerifiedGuest(
            id: (string) $user['id'],
            email: mb_strtolower(trim((string) $user['email'])),
            fullName: $fullName,
            user: $user,
        ));

        return $next($request);
    }
}
