<?php

namespace App\Services\Payments;

class MercadoPagoWebhookSignature
{
    public function __construct(
        private readonly ?string $secret = null,
    ) {}

    /**
     * Validate the x-signature HMAC for a payment notification.
     *
     * This only authenticates the notification. Callers must fetch the payment from Mercado Pago
     * and use that response as the authority for payment status.
     */
    public function isValid(
        ?string $signatureHeader,
        ?string $requestId,
        string|int|null $dataId,
    ): bool {
        $secret = $this->secret ?? config('services.mercadopago.webhook_secret');

        if (
            ! is_string($secret)
            || trim($secret) === ''
            || $signatureHeader === null
            || $requestId === null
            || $dataId === null
        ) {
            return false;
        }

        $parts = [];
        foreach (explode(',', $signatureHeader) as $component) {
            $pair = explode('=', trim($component), 2);
            if (count($pair) === 2) {
                $parts[$pair[0]] = $pair[1];
            }
        }

        if (! isset($parts['ts'], $parts['v1']) || ! ctype_digit($parts['ts'])) {
            return false;
        }

        $manifest = 'id:'.mb_strtolower((string) $dataId).';request-id:'.$requestId.';ts:'.$parts['ts'].';';
        $expected = hash_hmac('sha256', $manifest, $secret);

        return hash_equals($expected, $parts['v1']);
    }
}
