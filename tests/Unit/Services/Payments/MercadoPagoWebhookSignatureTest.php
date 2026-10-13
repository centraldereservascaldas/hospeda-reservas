<?php

namespace Tests\Unit\Services\Payments;

use App\Services\Payments\MercadoPagoWebhookSignature;
use Tests\TestCase;

class MercadoPagoWebhookSignatureTest extends TestCase
{
    public function test_valid_signature_is_accepted(): void
    {
        $validator = new MercadoPagoWebhookSignature('test-secret');

        $isValid = $validator->isValid(
            'ts=1704908010,v1=650cf8562f77c05a9ee28b45859c90b4c4a9bac0b687d81bd2fcf1c83490fbfd',
            'req-123',
            '123',
        );

        $this->assertTrue($isValid);
    }

    public function test_invalid_signature_is_rejected(): void
    {
        $validator = new MercadoPagoWebhookSignature('test-secret');

        $isValid = $validator->isValid(
            'ts=1704908010,v1=invalid',
            'req-123',
            '123',
        );

        $this->assertFalse($isValid);
    }
}
