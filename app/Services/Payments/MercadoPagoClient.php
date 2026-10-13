<?php

namespace App\Services\Payments;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

class MercadoPagoClient
{
    private const BASE_URL = 'https://api.mercadopago.com';

    public function __construct(
        private readonly ?string $accessToken = null,
    ) {}

    /**
     * Create a payment using tokenized payment method data and a stable idempotency key.
     *
     * @param  array<string, mixed>  $paymentMethodData  Mercado Pago Payments API fields, such as
     *                                                   payment_method_id, token, installments, payer, and issuer_id.
     * @param  array<string, mixed>  $additionalData  Optional Payments API fields (for example payer).
     * @return array<string, mixed>
     */
    public function createPayment(
        string|int|float $amountBrl,
        string $externalReference,
        string $idempotencyKey,
        array $paymentMethodData,
        array $additionalData = [],
    ): array {
        $amount = filter_var($amountBrl, FILTER_VALIDATE_FLOAT);

        if ($amount === false || $amount <= 0) {
            throw new InvalidArgumentException('Payment amount must be a positive BRL amount.');
        }

        if (trim($externalReference) === '' || trim($idempotencyKey) === '') {
            throw new InvalidArgumentException('External reference and idempotency key are required.');
        }

        if (! isset($paymentMethodData['payment_method_id'])) {
            throw new InvalidArgumentException('Payment method data must include payment_method_id.');
        }

        if ($this->containsRawCardData($paymentMethodData) || $this->containsRawCardData($additionalData)) {
            throw new InvalidArgumentException('Raw card data must never be sent through the application server.');
        }

        $payload = array_merge($additionalData, $paymentMethodData, [
            'transaction_amount' => round($amount, 2),
            'external_reference' => $externalReference,
            'currency_id' => 'BRL',
        ]);

        $response = $this->request()->withHeaders(['X-Idempotency-Key' => $idempotencyKey])
            ->post('/v1/payments', $payload);

        if ($response->status() === 400 && str_contains((string) $response->json('message'), 'idempotency')) {
            throw new InvalidArgumentException('Mercado Pago rejected the payment idempotency key.');
        }

        $response->throw();

        return $this->decodeObjectResponse($response);
    }

    /**
     * Fetch the authoritative payment state from Mercado Pago.
     *
     * @return array<string, mixed>
     */
    public function getPayment(string|int $paymentId): array
    {
        $paymentId = trim((string) $paymentId);

        if ($paymentId === '') {
            throw new InvalidArgumentException('Payment ID is required.');
        }

        $response = $this->request()
            ->get('/v1/payments/'.rawurlencode($paymentId))
            ->throw();

        return $this->decodeObjectResponse($response);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function containsRawCardData(array $data): bool
    {
        foreach ($data as $key => $value) {
            $normalizedKey = is_string($key) ? mb_strtolower((string) preg_replace('/[^a-z0-9]/i', '', $key)) : '';

            if (in_array($normalizedKey, ['cardnumber', 'securitycode', 'cvv', 'cvv2', 'cvc', 'cardcvv'], true)) {
                return true;
            }

            if (is_array($value) && $this->containsRawCardData($value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeObjectResponse(Response $response): array
    {
        $data = $response->json();

        if (! is_array($data) || array_is_list($data)) {
            throw new RuntimeException('Mercado Pago returned an unexpected response body.');
        }

        return $data;
    }

    private function request(): PendingRequest
    {
        $accessToken = $this->accessToken ?? config('services.mercadopago.access_token');

        if (! is_string($accessToken) || trim($accessToken) === '') {
            throw new RuntimeException('Mercado Pago access token is not configured.');
        }

        return Http::baseUrl(self::BASE_URL)
            ->acceptJson()
            ->withToken($accessToken)
            ->connectTimeout(3)
            ->timeout(10);
    }
}
