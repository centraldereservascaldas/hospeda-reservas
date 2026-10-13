<?php

namespace App\Jobs;

use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class ReconcileMercadoPagoPayment implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public function __construct(public readonly string $webhookId) {}

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 30, 90, 180];
    }

    public function handle(DirectCheckoutPaymentService $payments): void
    {
        $webhook = DirectBookingPaymentWebhook::query()->findOrFail($this->webhookId);
        if ($webhook->status === 'processed') {
            return;
        }

        try {
            $payments->reconcileGatewayPayment($webhook->gateway_payment_id);
            $webhook->forceFill([
                'status' => 'processed',
                'error_code' => null,
                'processed_at' => now(),
            ])->save();
        } catch (Throwable $exception) {
            $webhook->forceFill([
                'status' => 'retrying',
                'error_code' => 'payment_reconciliation_failed',
            ])->save();

            throw $exception;
        }
    }

    public function failed(?Throwable $exception): void
    {
        DirectBookingPaymentWebhook::query()->whereKey($this->webhookId)->update([
            'status' => 'failed',
            'error_code' => 'payment_reconciliation_failed',
        ]);
    }
}
