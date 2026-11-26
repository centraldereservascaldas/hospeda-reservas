<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Private server-to-server call; a timeout is an unknown outcome, not a retry signal. */
class ImobSysPreReservationClient
{
    /** Read-only lookup: unknown or unavailable must never trigger another mutation. */
    public function lookup(string $operationId): array
    {
        return $this->lookupOperation($operationId, null);
    }

    public function lookupByKey(string $idempotencyKey): array
    {
        if (! preg_match('/\A[A-Za-z0-9._~-]{16,128}\z/D', $idempotencyKey)) {
            throw new RuntimeException('Identificador inválido.');
        }
        return $this->lookupOperation('by-key', $idempotencyKey);
    }

    private function lookupOperation(string $operationId, ?string $idempotencyKey): array
    {
        $base = (string) config('services.partner_api.base_url');
        $key = (string) config('services.partner_api.reservation_key');
        if (! config('services.partner_api.reservations_enabled') || ($operationId !== 'by-key' && ! preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/iD', $operationId)) || trim($key) === '' || ! filter_var($base, FILTER_VALIDATE_URL) || parse_url($base, PHP_URL_SCHEME) !== 'https' || parse_url($base, PHP_URL_USER) !== null || parse_url($base, PHP_URL_QUERY) !== null || parse_url($base, PHP_URL_FRAGMENT) !== null) {
            throw new RuntimeException('Consulta do parceiro indisponível.');
        }
        $request = Http::acceptJson()->withToken($key)->withoutRedirecting()->connectTimeout(3)->timeout(35);
        if ($idempotencyKey !== null) $request = $request->withHeaders(['Idempotency-Key' => $idempotencyKey]);
        $response = $request->get(rtrim($base, '/').'/v1/pre-reservations/'.$operationId);
        $data = $response->json();
        $returnedId = data_get($data, 'data.operationId');
        if (! $response->successful() || ! is_array($data) || ($data['success'] ?? null) !== true || ! is_string($returnedId) || ! preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/iD', $returnedId) || ($operationId !== 'by-key' && $returnedId !== $operationId) || ! in_array(data_get($data, 'data.state'), ['starting', 'created', 'unknown', 'rejected'], true)) {
            throw new RuntimeException('Consulta da pré-reserva indisponível.');
        }
        return $data['data'];
    }

    public function create(array $input, string $idempotencyKey, ?callable $onOperationId = null): array
    {
        $base = (string) config('services.partner_api.base_url');
        $key = (string) config('services.partner_api.reservation_key');
        if (! config('services.partner_api.reservations_enabled') || ! preg_match('/\A[A-Za-z0-9._~-]{16,128}\z/D', $idempotencyKey) || trim($key) === '' || ! filter_var($base, FILTER_VALIDATE_URL) || parse_url($base, PHP_URL_SCHEME) !== 'https' || parse_url($base, PHP_URL_USER) !== null || parse_url($base, PHP_URL_QUERY) !== null || parse_url($base, PHP_URL_FRAGMENT) !== null) {
            throw new RuntimeException('Pré-reserva do parceiro indisponível.');
        }

        try {
            $response = Http::acceptJson()->withToken($key)->withHeaders(['Idempotency-Key' => $idempotencyKey])->withoutRedirecting()->connectTimeout(3)->timeout(130)->post(rtrim($base, '/').'/v1/pre-reservations', $input);
        } catch (ConnectionException $exception) {
            throw new RuntimeException('Resultado da pré-reserva incerto; consultar antes de repetir.', previous: $exception);
        }
        $operationId = $response->header('X-Request-Id');
        if ($onOperationId !== null && is_string($operationId) && preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/iD', $operationId)) {
            $onOperationId($operationId);
        }
        $data = $response->json();
        $payable = data_get($data, 'data.supplierPayableObservedCents');
        if (! $response->successful() || ! is_array($data) || ($data['success'] ?? null) !== true || ! is_array($data['data'] ?? null) || ($data['data']['status'] ?? null) !== 'pre_reservation_created' || ! is_string($data['data']['id'] ?? null) || ! preg_match('/\A[1-9]\d{0,11}\z/D', $data['data']['id']) || ($data['data']['currency'] ?? null) !== 'BRL' || ($data['data']['amountCents'] ?? null) !== ($input['acceptedTotalCents'] ?? null) || ($payable !== null && (! is_int($payable) || $payable < 1))) {
            throw new RuntimeException('Pré-reserva requer conferência.');
        }

        return $data['data'];
    }
}
