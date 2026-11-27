<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Server-to-server sandbox transport. An uncertain write must never be retried automatically. */
class ImobSysSandboxCheckoutClient
{
    public function start(array $input): array
    {
        return $this->post('/internal/checkout/start', $input);
    }

    public function reconcile(string $id): array
    {
        if (! preg_match('/\A[A-Za-z0-9]{1,25}\z/D', $id)) {
            throw new RuntimeException('Pedido inválido.');
        }

        return $this->post('/internal/checkout/reconcile', ['id' => $id]);
    }

    public function status(string $id): array
    {
        if (! preg_match('/\A[A-Za-z0-9]{1,25}\z/D', $id)) {
            throw new RuntimeException('Pedido inválido.');
        }

        return $this->request('/internal/checkout/'.$id, null);
    }

    private function post(string $path, array $input): array
    {
        return $this->request($path, $input);
    }

    private function request(string $path, ?array $input): array
    {
        $base = (string) config('services.partner_checkout_sandbox.base_url');
        $key = (string) config('services.partner_checkout_sandbox.key');
        if (! config('services.partner_checkout_sandbox.enabled') || ! preg_match('/\A[a-f0-9]{64}\z/iD', $key) || ! filter_var($base, FILTER_VALIDATE_URL) || parse_url($base, PHP_URL_SCHEME) !== 'https' || parse_url($base, PHP_URL_USER) !== null || parse_url($base, PHP_URL_QUERY) !== null || parse_url($base, PHP_URL_FRAGMENT) !== null) {
            throw new RuntimeException('Checkout sandbox indisponível.');
        }

        try {
            $request = Http::acceptJson()->withHeaders(['x-local-control' => $key])->withoutRedirecting()->connectTimeout(3)->timeout(90);
            $response = $input === null ? $request->get(rtrim($base, '/').$path) : $request->post(rtrim($base, '/').$path, $input);
        } catch (ConnectionException $exception) {
            throw new RuntimeException('Resultado incerto; consulte o pedido antes de repetir.', previous: $exception);
        }
        $data = $response->json();
        if (! $response->successful() || ! is_array($data) || ($data['success'] ?? null) !== true) {
            throw new RuntimeException('Checkout sandbox requer conferência.');
        }

        return $data;
    }
}
