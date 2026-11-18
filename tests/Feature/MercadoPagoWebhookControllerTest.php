<?php

namespace Tests\Feature;

use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingPaymentWebhook;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Mockery;
use Tests\TestCase;

class MercadoPagoWebhookControllerTest extends TestCase
{
    public function test_returns_401_without_saving_or_dispatching_when_signature_is_invalid(): void
    {
        $this->migrateTestDatabase();
        config([
            'services.mercadopago.webhook_secret' => 'synthetic-webhook-secret',
            'services.mercadopago.webhook_queue_connection' => 'database',
        ]);
        Http::preventStrayRequests();
        Http::fake(['https://api.mercadopago.com/*' => Http::response([], 200)]);
        Queue::fake([ReconcileMercadoPagoPayment::class]);
        Log::spy();

        $response = $this->postJson('/api/webhooks/mercadopago?type=payment&data.id=987654', [
            'action' => 'payment.updated',
            'type' => 'payment',
        ], [
            'x-request-id' => 'request-invalid-signature',
            'x-signature' => 'ts=1704908010,v1=not-a-valid-signature',
        ]);

        $response->assertUnauthorized()->assertJsonPath('code', 'invalid_signature');
        $this->assertDatabaseCount('direct_booking_payment_webhooks', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();
        Log::shouldHaveReceived('warning')->once()->with('checkout.webhook.rejected', Mockery::on(
            static fn (array $context): bool => $context === [
                'event' => 'checkout.webhook.rejected',
                'gateway' => 'mercadopago',
                'reason' => 'invalid_signature',
            ],
        ));
    }

    public function test_persists_and_dispatches_reconciliation_for_a_valid_signature(): void
    {
        $this->migrateTestDatabase();
        config([
            'services.mercadopago.webhook_secret' => 'synthetic-webhook-secret',
            'services.mercadopago.webhook_queue_connection' => 'database',
        ]);
        Http::preventStrayRequests();
        Http::fake(['https://api.mercadopago.com/*' => Http::response([], 200)]);

        DB::beginTransaction();
        $shouldCommit = false;
        try {
            $response = $this->sendSignedPaymentNotification(
                requestId: 'request-valid-signature',
                paymentId: '987654',
            );

            $response->assertAccepted()->assertJsonPath('received', true);
            $webhook = DirectBookingPaymentWebhook::query()->sole();
            $this->assertSame('987654', $webhook->gateway_payment_id);
            $this->assertSame('request-valid-signature', $webhook->request_id);
            $this->assertSame('received', $webhook->status);
            $this->assertDatabaseCount('jobs', 0);
            $shouldCommit = true;
        } finally {
            if (DB::transactionLevel() > 0) {
                if ($shouldCommit) {
                    DB::commit();
                } else {
                    DB::rollBack();
                }
            }
        }

        $webhook = DirectBookingPaymentWebhook::query()->sole();
        $this->assertDatabaseCount('jobs', 1);
        $queuedJobPayload = DB::table('jobs')->value('payload');
        $this->assertIsString($queuedJobPayload);
        $this->assertSame(
            ReconcileMercadoPagoPayment::class,
            json_decode($queuedJobPayload, true, flags: JSON_THROW_ON_ERROR)['displayName'],
        );
        Http::assertNothingSent();
    }

    public function test_returns_duplicate_without_saving_or_dispatching_again_for_a_repeated_delivery(): void
    {
        $this->migrateTestDatabase();
        config([
            'services.mercadopago.webhook_secret' => 'synthetic-webhook-secret',
            'services.mercadopago.webhook_queue_connection' => 'database',
        ]);
        Http::preventStrayRequests();
        Http::fake(['https://api.mercadopago.com/*' => Http::response([], 200)]);
        Queue::fake([ReconcileMercadoPagoPayment::class]);

        $firstResponse = $this->sendSignedPaymentNotification(
            requestId: 'request-duplicate-delivery',
            paymentId: '123456',
        );
        $duplicateResponse = $this->sendSignedPaymentNotification(
            requestId: 'request-duplicate-delivery',
            paymentId: '123456',
        );

        $firstResponse->assertAccepted()->assertJsonPath('received', true);
        $duplicateResponse->assertOk()->assertJsonPath('duplicate', true);
        $this->assertDatabaseCount('direct_booking_payment_webhooks', 1);
        Queue::assertPushed(ReconcileMercadoPagoPayment::class, 1);
        Http::assertNothingSent();
    }

    private function sendSignedPaymentNotification(string $requestId, string $paymentId): TestResponse
    {
        $timestamp = '1704908010';
        $manifest = "id:{$paymentId};request-id:{$requestId};ts:{$timestamp};";
        $signature = hash_hmac('sha256', $manifest, 'synthetic-webhook-secret');

        return $this->postJson('/api/webhooks/mercadopago?type=payment&data.id='.$paymentId, [
            'action' => 'payment.updated',
            'type' => 'payment',
        ], [
            'x-request-id' => $requestId,
            'x-signature' => "ts={$timestamp},v1={$signature}",
        ]);
    }

    private function migrateTestDatabase(): void
    {
        $this->artisan('migrate:fresh', ['--no-interaction' => true]);
    }
}
