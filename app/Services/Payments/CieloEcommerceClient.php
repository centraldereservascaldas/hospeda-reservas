<?php

namespace App\Services\Payments;

use App\Services\MoneyAmount;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

class CieloEcommerceClient
{
    public function __construct(private readonly CieloDirectConfiguration $configuration) {}

    public function isConfigured(): bool
    {
        return $this->configuration->isAllowed()
            && (bool) $this->configuration->value('enabled')
            && $this->merchantId() !== null
            && $this->merchantKey() !== null;
    }

    public function merchantId(): ?string
    {
        return $this->configuredValue('merchant_id');
    }

    /** @return array<string, mixed> */
    public function createCardPayment(
        string $paymentToken,
        string $merchantOrderId,
        string $amount,
        string $currency,
        string $customerName,
        string $customerIdentity,
    ): array {
        if (! $this->configuration->canCharge()) {
            throw new RuntimeException('Cielo direct payments are disabled.');
        }
        if (! preg_match('/^[0-9a-f-]{36}$/iD', $paymentToken)) {
            throw new InvalidArgumentException('A valid one-time Cielo PaymentToken is required.');
        }

        if (! preg_match('/^[A-Za-z0-9]{1,36}$/D', $merchantOrderId)) {
            throw new InvalidArgumentException('A valid Cielo MerchantOrderId is required.');
        }

        $amountCents = MoneyAmount::toCents($amount);
        if ($amountCents === null || $amountCents < 1 || $currency !== 'BRL') {
            throw new InvalidArgumentException('Cielo payments require a positive BRL amount.');
        }

        $response = $this->request($this->configuration->endpoint('transaction'))
            ->post('/1/sales/', [
                'MerchantOrderId' => $merchantOrderId,
                'Customer' => [
                    'Name' => mb_substr(trim($customerName), 0, 255),
                    'Identity' => preg_replace('/\D+/', '', $customerIdentity),
                ],
                'Payment' => [
                    'Type' => 'CreditCard',
                    'Amount' => $amountCents,
                    'Currency' => 'BRL',
                    'Capture' => true,
                    'Installments' => 1,
                    ...($this->configuration->environment() === 'sandbox' ? ['Provider' => 'Simulado'] : []),
                    'CreditCard' => ['PaymentToken' => $paymentToken],
                ],
            ]);

        return $this->decodeObjectResponse($response->throw());
    }

    /** @return array<string, mixed>|null */
    public function findPaymentById(string $paymentId): ?array
    {
        if (! preg_match('/^[0-9a-f-]{36}$/iD', $paymentId)) {
            throw new InvalidArgumentException('A valid Cielo PaymentId is required.');
        }

        $response = $this->request($this->configuration->endpoint('query'))->get('/1/sales/'.rawurlencode($paymentId));
        if ($response->notFound()) {
            return null;
        }

        return $this->decodeObjectResponse($response->throw());
    }

    /** @return array<string, mixed>|null */
    public function findPaymentByMerchantOrderId(string $merchantOrderId): ?array
    {
        if (! preg_match('/^[A-Za-z0-9]{1,36}$/D', $merchantOrderId)) {
            throw new InvalidArgumentException('A valid Cielo MerchantOrderId is required.');
        }

        $response = $this->request($this->configuration->endpoint('query'))->get('/1/sales', ['merchantOrderId' => $merchantOrderId]);
        if ($response->notFound()) {
            return null;
        }

        $data = $response->throw()->json();
        if (! is_array($data)) {
            throw new RuntimeException('Cielo returned an unexpected query response.');
        }

        if (array_is_list($data)) {
            if (count($data) > 1) {
                throw new RuntimeException('Cielo returned multiple payments for one persisted MerchantOrderId.');
            }

            $data = $data[0] ?? null;
        }

        if (! is_array($data)) {
            return null;
        }

        $paymentId = $data['PaymentId'] ?? null;
        if (! is_string($paymentId) || ! preg_match('/^[0-9a-f-]{36}$/iD', $paymentId)) {
            return null;
        }

        return $this->findPaymentById($paymentId);
    }

    private function merchantKey(): ?string
    {
        return $this->configuredValue('merchant_key');
    }

    private function configuredValue(string $key): ?string
    {
        $value = $this->configuration->value($key);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function request(string $baseUrl): PendingRequest
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Cielo direct credentials are not enabled.');
        }

        return Http::baseUrl($baseUrl)
            ->acceptJson()
            ->withHeaders([
                'MerchantId' => $this->merchantId(),
                'MerchantKey' => $this->merchantKey(),
            ])
            ->connectTimeout(3)
            ->timeout(10);
    }

    /** @return array<string, mixed> */
    private function decodeObjectResponse(Response $response): array
    {
        $data = $response->json();

        if (! is_array($data) || array_is_list($data)) {
            throw new RuntimeException('Cielo returned an unexpected payment response.');
        }

        return $data;
    }
}
