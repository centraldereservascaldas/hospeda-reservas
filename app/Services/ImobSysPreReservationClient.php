<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Private server-to-server call; a timeout is an unknown outcome, not a retry signal. */
class ImobSysPreReservationClient
{
    public function create(array $input, string $idempotencyKey): array
    {
        $base = (string) config('services.partner_api.base_url');
        $key = (string) config('services.partner_api.key');
        if (! config('services.partner_api.reservations_enabled') || ! preg_match('/\A[A-Za-z0-9._~-]{16,128}\z/D', $idempotencyKey) || trim($key) === '' || ! filter_var($base, FILTER_VALIDATE_URL) || parse_url($base, PHP_URL_SCHEME) !== 'https' || parse_url($base, PHP_URL_USER) !== null || parse_url($base, PHP_URL_QUERY) !== null || parse_url($base, PHP_URL_FRAGMENT) !== null) {
            throw new RuntimeException('Pré-reserva do parceiro indisponível.');
        }

        try {
            $response = Http::acceptJson()->withToken($key)->withHeaders(['Idempotency-Key' => $idempotencyKey])->withoutRedirecting()->connectTimeout(3)->timeout(130)->post(rtrim($base, '/').'/v1/pre-reservations', $input);
        } catch (ConnectionException $exception) {
            throw new RuntimeException('Resultado da pré-reserva incerto; consultar antes de repetir.', previous: $exception);
        }
        $data = $response->json();
        if (! $response->successful() || ! is_array($data) || ($data['success'] ?? null) !== true || ! is_array($data['data'] ?? null) || ($data['data']['status'] ?? null) !== 'pre_reservation_created' || ! is_string($data['data']['id'] ?? null) || ! preg_match('/\A[1-9]\d{0,11}\z/D', $data['data']['id']) || ($data['data']['currency'] ?? null) !== 'BRL' || ($data['data']['amountCents'] ?? null) !== ($input['acceptedTotalCents'] ?? null)) {
            throw new RuntimeException('Pré-reserva requer conferência.');
        }

        return $data['data'];
    }
}
