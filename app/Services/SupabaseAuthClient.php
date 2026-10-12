<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class SupabaseAuthClient
{
    /**
     * @return array{user: array<string, mixed>|null, error: 'not_configured'|'invalid_session'|'unavailable'|null}
     */
    public function getUser(string $accessToken): array
    {
        $baseUrl = rtrim((string) config('services.supabase.url'), '/');
        $apiKey = (string) (config('services.supabase.anon_key') ?: config('services.supabase.service_role_key'));

        if ($baseUrl === '' || $apiKey === '') {
            return ['user' => null, 'error' => 'not_configured'];
        }

        try {
            $response = Http::acceptJson()
                ->withHeaders(['apikey' => $apiKey])
                ->withToken($accessToken)
                ->connectTimeout(3)
                ->timeout((int) config('services.supabase.timeout', 5))
                ->get($baseUrl.'/auth/v1/user');
        } catch (ConnectionException) {
            return ['user' => null, 'error' => 'unavailable'];
        }

        if ($response->unauthorized() || $response->forbidden()) {
            return ['user' => null, 'error' => 'invalid_session'];
        }

        if (! $response->successful()) {
            return ['user' => null, 'error' => 'unavailable'];
        }

        $user = $response->json();

        return is_array($user) && isset($user['id'], $user['email'])
            ? ['user' => $user, 'error' => null]
            : ['user' => null, 'error' => 'invalid_session'];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getAdminUser(string $userId): ?array
    {
        $baseUrl = rtrim((string) config('services.supabase.url'), '/');
        $serviceRoleKey = (string) config('services.supabase.service_role_key');

        if ($baseUrl === '' || $serviceRoleKey === '') {
            return null;
        }

        try {
            $response = Http::acceptJson()
                ->withHeaders(['apikey' => $serviceRoleKey])
                ->withToken($serviceRoleKey)
                ->connectTimeout(3)
                ->timeout((int) config('services.supabase.timeout', 5))
                ->get($baseUrl.'/auth/v1/admin/users/'.rawurlencode($userId));
        } catch (ConnectionException) {
            return null;
        }

        return $response->successful() && is_array($response->json()) ? $response->json() : null;
    }
}
