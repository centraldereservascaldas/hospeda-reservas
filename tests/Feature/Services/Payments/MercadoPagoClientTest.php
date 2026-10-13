<?php

namespace Tests\Feature\Services\Payments;

use App\Services\Payments\MercadoPagoClient;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class MercadoPagoClientTest extends TestCase
{
    public function test_create_payment_sends_idempotency_key_and_returns_payment_object(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://api.mercadopago.com/v1/payments' => Http::response(['id' => 987, 'status' => 'pending'], 201),
        ]);

        $payment = (new MercadoPagoClient('test-access-token'))->createPayment(
            '1250.50',
            'order-uuid-1',
            'attempt-uuid-1',
            ['payment_method_id' => 'pix'],
            ['payer' => ['email' => 'guest@example.test']],
        );

        $this->assertSame(['id' => 987, 'status' => 'pending'], $payment);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://api.mercadopago.com/v1/payments'
            && $request->hasHeader('X-Idempotency-Key', 'attempt-uuid-1')
            && $request->data()['transaction_amount'] === 1250.5
            && $request->data()['external_reference'] === 'order-uuid-1'
            && $request->data()['payment_method_id'] === 'pix'
            && $request->data()['payer']['email'] === 'guest@example.test'
        );
    }

    public function test_get_payment_returns_authoritative_gateway_object(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://api.mercadopago.com/v1/payments/987' => Http::response(['id' => 987, 'status' => 'approved']),
        ]);

        $payment = (new MercadoPagoClient('test-access-token'))->getPayment('987');

        $this->assertSame(['id' => 987, 'status' => 'approved'], $payment);
        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'GET'
            && $request->url() === 'https://api.mercadopago.com/v1/payments/987'
        );
    }

    public function test_unexpected_response_body_throws_runtime_exception(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://api.mercadopago.com/v1/payments/987' => Http::response('null'),
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Mercado Pago returned an unexpected response body.');

        (new MercadoPagoClient('test-access-token'))->getPayment('987');
    }

    public function test_raw_card_data_is_rejected_even_when_nested(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://api.mercadopago.com/*' => Http::response(['id' => 1])]);

        try {
            (new MercadoPagoClient('test-access-token'))->createPayment(
                100,
                'order-uuid-2',
                'attempt-uuid-2',
                ['payment_method_id' => 'visa'],
                ['payer' => ['cardNumber' => '4111111111111111', 'security_code' => '123']],
            );

            $this->fail('Raw card data should be rejected.');
        } catch (\InvalidArgumentException $exception) {
            $this->assertSame(
                'Raw card data must never be sent through the application server.',
                $exception->getMessage(),
            );
        }

        Http::assertNothingSent();
    }
}
