<?php

namespace Tests\Feature\Console\Commands;

use App\Jobs\ReconcileMercadoPagoPayment;
use App\Models\DirectBookingPaymentWebhook;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RecoverDirectBookingReservationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_stale_processing_webhook_is_requeued_when_recovery_command_runs(): void
    {
        $this->freezeTime();
        config([
            'services.mercadopago.access_token' => 'test-access-token',
            'services.mercadopago.webhook_queue_connection' => 'database',
        ]);
        Bus::fake([ReconcileMercadoPagoPayment::class]);

        $webhook = DirectBookingPaymentWebhook::query()->create([
            'event_key' => hash('sha256', 'stale-processing-payment-webhook-test'),
            'gateway_payment_id' => '987654321',
            'request_id' => 'request-stale-processing-test',
            'status' => 'processing',
            'received_at' => now()->subHour(),
            'updated_at' => now()->subMinutes(20),
        ]);
        $webhook->forceFill(['updated_at' => now()->subMinutes(20)])->save();

        $this->artisan('direct-booking:recover-reservations')
            ->assertSuccessful();

        $webhook->refresh();
        $this->assertSame('queued', $webhook->status);
        Bus::assertDispatched(ReconcileMercadoPagoPayment::class, fn (ReconcileMercadoPagoPayment $job): bool => $job->webhookId === $webhook->id && $job->connection === 'database');
    }

    #[DataProvider('webhookStatesThatMustNotBeRedispatched')]
    public function test_recovery_command_does_not_redispatch_recent_or_terminal_webhooks(
        string $status,
        int $reconciliationAttempts,
        bool $isStale,
    ): void {
        $this->freezeTime();
        config([
            'services.mercadopago.access_token' => 'test-access-token',
            'services.mercadopago.webhook_queue_connection' => 'database',
        ]);
        Bus::fake([ReconcileMercadoPagoPayment::class]);

        $webhook = DirectBookingPaymentWebhook::query()->create([
            'event_key' => hash('sha256', "non-recoverable-{$status}-{$reconciliationAttempts}"),
            'gateway_payment_id' => '987654321',
            'request_id' => "request-non-recoverable-{$status}-{$reconciliationAttempts}",
            'status' => $status,
            'received_at' => $isStale ? now()->subHour() : now(),
        ]);
        $webhook->forceFill([
            'reconciliation_attempts' => $reconciliationAttempts,
            ...($isStale ? ['updated_at' => now()->subMinutes(20)] : []),
        ])->save();

        $this->artisan('direct-booking:recover-reservations')->assertSuccessful();

        $webhook->refresh();
        $this->assertSame($status, $webhook->status);
        $this->assertSame($reconciliationAttempts, $webhook->reconciliation_attempts);
        Bus::assertNothingDispatched();
    }

    public static function webhookStatesThatMustNotBeRedispatched(): array
    {
        return [
            'recent received webhook' => ['received', 0, false],
            'processed webhook' => ['processed', 2, true],
            'webhook at reconciliation attempt limit' => [
                'failed',
                ReconcileMercadoPagoPayment::MAX_RECONCILIATION_ATTEMPTS,
                true,
            ],
        ];
    }
}
