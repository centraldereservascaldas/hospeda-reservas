<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Jobs\ReconcileCieloPaymentWebhook;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CieloWebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_notification_authentication_is_rejected_without_persisting_or_dispatching(): void
    {
        $this->configureWebhook();
        Http::preventStrayRequests();
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);

        $this->postJson('/api/webhooks/cielo', $this->notification(), ['X-Cielo-Secret' => 'incorrect-secret'])
            ->assertUnauthorized()->assertJsonPath('code', 'invalid_notification');

        $this->assertDatabaseCount('direct_booking_payment_webhooks', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    public function test_partial_webhook_authentication_configuration_is_rejected(): void
    {
        $this->configureWebhook();
        config(['services.cielo.webhook_header_value' => null]);
        Http::preventStrayRequests();
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);

        $this->postJson('/api/webhooks/cielo', $this->notification())
            ->assertUnauthorized()->assertJsonPath('code', 'invalid_notification');

        $this->assertDatabaseCount('direct_booking_payment_webhooks', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    public function test_missing_webhook_authentication_configuration_accepts_notification_hint_for_later_lookup(): void
    {
        $this->configureWebhook();
        config([
            'services.cielo.webhook_header_name' => null,
            'services.cielo.webhook_header_value' => null,
        ]);
        Http::preventStrayRequests();
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);

        $this->postJson('/api/webhooks/cielo', $this->notification())
            ->assertAccepted()->assertJsonPath('queued', true);

        $this->assertDatabaseHas('direct_booking_payment_webhooks', [
            'gateway_provider' => 'cielo_sandbox',
            'gateway_payment_id' => '123e4567-e89b-12d3-a456-426614174040',
        ]);
        Queue::assertPushed(ReconcileCieloPaymentWebhook::class, 1);
        Http::assertNothingSent();
    }

    public function test_blank_webhook_authentication_configuration_is_rejected(): void
    {
        $this->configureWebhook();
        config([
            'services.cielo.webhook_header_name' => '',
            'services.cielo.webhook_header_value' => '',
        ]);
        Http::preventStrayRequests();
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);

        $this->postJson('/api/webhooks/cielo', $this->notification())
            ->assertUnauthorized()->assertJsonPath('code', 'invalid_notification');

        $this->assertDatabaseCount('direct_booking_payment_webhooks', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    #[DataProvider('unavailableQueueConnections')]
    public function test_sync_or_missing_webhook_queue_is_rejected_before_claiming_notification(string $connection): void
    {
        $this->configureWebhook();
        config(['services.cielo.webhook_queue_connection' => $connection]);
        Http::preventStrayRequests();
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);

        $this->postJson('/api/webhooks/cielo', $this->notification(), ['X-Cielo-Secret' => 'synthetic-cielo-webhook-secret'])
            ->assertStatus(503)->assertJsonPath('code', 'webhook_queue_unavailable');

        $this->assertDatabaseCount('direct_booking_payment_webhooks', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    public static function unavailableQueueConnections(): array
    {
        return ['sync connection' => ['sync'], 'unconfigured connection' => ['unconfigured']];
    }

    public function test_valid_notification_queues_authoritative_lookup_and_duplicate_is_deduplicated_per_provider(): void
    {
        $this->configureWebhook();
        Http::preventStrayRequests();
        Http::fake(['https://apiquerysandbox.cieloecommerce.cielo.com.br/*' => Http::response([])]);
        Queue::fake([ReconcileCieloPaymentWebhook::class]);
        DirectBookingPaymentWebhook::query()->create([
            'event_key' => hash('sha256', 'mercadopago|123e4567-e89b-12d3-a456-426614174040|1|'.intdiv(now()->timestamp, 300)),
            'gateway_provider' => 'mercadopago',
            'gateway_payment_id' => '123e4567-e89b-12d3-a456-426614174040',
            'status' => 'received',
            'received_at' => now(),
        ]);

        $first = $this->postJson('/api/webhooks/cielo', $this->notification(), ['X-Cielo-Secret' => 'synthetic-cielo-webhook-secret', 'X-Request-Id' => 'cielo-request-sentinel']);
        $duplicate = $this->postJson('/api/webhooks/cielo', $this->notification(), ['X-Cielo-Secret' => 'synthetic-cielo-webhook-secret', 'X-Request-Id' => 'cielo-request-sentinel']);

        $first->assertAccepted()->assertJsonPath('queued', true);
        $duplicate->assertOk()->assertJsonPath('duplicate', true);
        $this->assertDatabaseCount('direct_booking_payment_webhooks', 2);
        $this->assertDatabaseHas('direct_booking_payment_webhooks', [
            'gateway_provider' => 'cielo_sandbox',
            'gateway_payment_id' => '123e4567-e89b-12d3-a456-426614174040',
            'request_id' => 'cielo-request-sentinel',
        ]);
        Queue::assertPushed(ReconcileCieloPaymentWebhook::class, 1);
        Http::assertNothingSent();
    }

    public function test_webhook_status_hint_is_ignored_and_job_uses_authoritative_cielo_lookup(): void
    {
        $this->configureWebhook();
        Http::preventStrayRequests();
        $order = $this->createCieloOrder();
        $attempt = $this->createCieloAttempt($order);
        $webhook = DirectBookingPaymentWebhook::query()->create([
            'event_key' => hash('sha256', 'synthetic-cielo-webhook-event'),
            'gateway_provider' => 'cielo_sandbox',
            'gateway_payment_id' => '123e4567-e89b-12d3-a456-426614174041',
            'status' => 'received',
            'received_at' => now(),
        ]);
        Http::fake([
            'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174041' => Http::response([
                'PaymentId' => '123e4567-e89b-12d3-a456-426614174041',
                'MerchantOrderId' => $attempt->merchant_order_id,
                'Payment' => [
                    'Type' => 'CreditCard',
                    'Status' => 1,
                    'Amount' => 125050,
                    'Currency' => 'BRL',
                ],
            ]),
        ]);

        (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class));

        $this->assertSame('pending', $attempt->refresh()->status);
        $this->assertSame('authorized', $attempt->gateway_status);
        $this->assertNotSame('approved', $order->refresh()->payment_status);
        $this->assertSame('processed', $webhook->refresh()->status);
        Http::assertSentCount(1);
        Http::assertSent(fn ($request): bool => $request->method() === 'GET'
            && $request->url() === 'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174041');
    }

    public function test_unknown_payment_id_is_not_attached_to_an_existing_attempt(): void
    {
        $this->configureWebhook();
        Http::preventStrayRequests();
        $order = $this->createCieloOrder();
        $attempt = $this->createCieloAttempt($order);
        $webhook = DirectBookingPaymentWebhook::query()->create([
            'event_key' => hash('sha256', 'synthetic-cielo-unknown-event'),
            'gateway_provider' => 'cielo_sandbox',
            'gateway_payment_id' => '123e4567-e89b-12d3-a456-426614174042',
            'status' => 'received',
            'received_at' => now(),
        ]);
        Http::fake([
            'https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/123e4567-e89b-12d3-a456-426614174042' => Http::response([], 404),
        ]);

        try {
            (new ReconcileCieloPaymentWebhook($webhook->id))->handle(app(DirectCheckoutPaymentService::class));
            $this->fail('An unknown Cielo payment should remain unassociated.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('payment_reconciliation_failed', $exception->getMessage());
        }

        $this->assertSame('unknown', $attempt->refresh()->status);
        $this->assertNull($attempt->gateway_payment_id);
        $this->assertSame('retrying', $webhook->refresh()->status);
    }

    private function configureWebhook(): void
    {
        config([
            'services.cielo.webhook_header_name' => 'X-Cielo-Secret',
            'services.cielo.webhook_header_value' => 'synthetic-cielo-webhook-secret',
            'services.cielo.webhook_queue_connection' => 'database',
            'services.cielo.enabled' => true,
            'services.cielo.merchant_id' => 'cielo-merchant-sentinel',
            'services.cielo.merchant_key' => 'cielo-key-sentinel',
        ]);
    }

    private function notification(): array
    {
        return [
            'PaymentId' => '123e4567-e89b-12d3-a456-426614174040',
            'ChangeType' => 1,
            'Status' => 'captured',
            'Amount' => 1,
        ];
    }

    private function createCieloOrder(): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => fake()->uuid(),
            'public_reference' => bin2hex(random_bytes(20)),
            'resume_token' => 'synthetic-resume-token',
            'resume_token_expires_at' => now()->addDay(),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'synthetic-listing',
            'stays_listing_id' => 'synthetic-stays-listing',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2],
            'guest_name' => 'Synthetic Guest',
            'guest_email' => 'guest@example.test',
            'guest_phone' => '+5511999999999',
            'quote_total' => '1250.50',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'synthetic-terms-v1',
            'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(),
            'origin' => 'website',
            'reservation_status' => 'reserved',
            'stays_reservation_id' => 'synthetic-reservation',
            'expires_at' => now()->addHour(),
            'operational_events' => [],
            'gateway_provider' => 'cielo_sandbox',
            'gateway_merchant_id' => 'cielo-merchant-sentinel',
        ]);
    }

    private function createCieloAttempt(DirectBookingOrder $order): DirectBookingPaymentAttempt
    {
        return DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id,
            'idempotency_key' => fake()->uuid(),
            'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'cielo_sandbox',
            'gateway_merchant_id' => 'cielo-merchant-sentinel',
            'merchant_order_id' => 'syntheticmerchantorder1',
            'payment_method' => 'card',
            'payment_method_id' => 'cielo_credit_card',
            'status' => 'unknown',
            'gateway_status' => 'unknown',
            'amount' => '1250.50',
            'currency' => 'BRL',
            'expires_at' => $order->expires_at,
        ]);
    }
}
