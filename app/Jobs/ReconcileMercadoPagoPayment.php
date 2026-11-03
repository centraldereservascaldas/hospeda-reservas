<?php

namespace App\Jobs;

use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Client\RequestException;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class ReconcileMercadoPagoPayment implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public const MAX_RECONCILIATION_ATTEMPTS = 10;

    public function __construct(public readonly string $webhookId) {}

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 30, 90, 180];
    }

    public function handle(DirectCheckoutPaymentService $payments): void
    {
        $shouldProcess = DB::transaction(function (): bool {
            $webhook = DirectBookingPaymentWebhook::query()->lockForUpdate()->findOrFail($this->webhookId);
            if ($webhook->gateway_provider !== 'mercadopago') {
                return false;
            }
            if (in_array($webhook->status, ['processed', 'processing'], true)) {
                return false;
            }

            if ($webhook->reconciliation_attempts >= self::MAX_RECONCILIATION_ATTEMPTS) {
                $webhook->forceFill([
                    'status' => 'failed',
                    'error_code' => 'reconciliation_attempt_limit_reached',
                ])->save();

                return false;
            }

            $webhook->forceFill([
                'status' => 'processing',
                'error_code' => null,
                'reconciliation_attempts' => $webhook->reconciliation_attempts + 1,
            ])->save();

            return true;
        });

        if (! $shouldProcess) {
            return;
        }

        $webhook = DirectBookingPaymentWebhook::query()->findOrFail($this->webhookId);

        try {
            $result = $payments->reconcileGatewayPayment($webhook->gateway_payment_id);
            $authoritativeReviewRequired = $result['code'] === 'attention_required'
                && in_array($result['attempt']?->gateway_status, ['refunded', 'charged_back'], true);
            if ($result['status'] >= 500 && ! $authoritativeReviewRequired) {
                throw new \RuntimeException('The gateway payment could not be reconciled safely.');
            }

            $webhook->forceFill([
                'status' => 'processed',
                'error_code' => null,
                'processed_at' => now(),
            ])->save();
            Log::info('checkout.webhook.reconciled', [
                'event' => 'checkout.webhook.reconciled',
                'correlation_id' => $webhook->id,
                'webhook_id' => $webhook->id,
                'gateway' => 'mercadopago',
                'result_code' => $result['code'],
                'http_status' => $result['status'],
                'reconciliation_attempt' => $webhook->refresh()->reconciliation_attempts,
            ]);
        } catch (Throwable $exception) {
            DB::transaction(function () use ($webhook): void {
                $lockedWebhook = DirectBookingPaymentWebhook::query()->lockForUpdate()->findOrFail($webhook->id);
                if ($lockedWebhook->status === 'processed') {
                    return;
                }

                $lockedWebhook->forceFill([
                    'status' => 'retrying',
                    'error_code' => 'payment_reconciliation_failed',
                ])->save();
            });

            $failureCode = $exception instanceof RequestException
                ? 'payment_reconciliation_failed; gateway_http_status='.$exception->response->status()
                : 'payment_reconciliation_failed';

            Log::warning('checkout.webhook.reconciliation_retrying', [
                'event' => 'checkout.webhook.reconciliation_retrying',
                'correlation_id' => $webhook->id,
                'webhook_id' => $webhook->id,
                'gateway' => 'mercadopago',
                'reason' => 'payment_reconciliation_failed',
                'exception_class' => $exception::class,
                'gateway_http_status' => $exception instanceof RequestException
                    ? $exception->response->status()
                    : null,
                'reconciliation_attempt' => $webhook->refresh()->reconciliation_attempts,
            ]);

            throw new \RuntimeException($failureCode);
        }
    }

    public function failed(?Throwable $exception): void
    {
        DB::transaction(function (): void {
            $webhook = DirectBookingPaymentWebhook::query()->lockForUpdate()->find($this->webhookId);
            if ($webhook === null || $webhook->status === 'processed') {
                return;
            }

            $webhook->forceFill([
                'status' => 'failed',
                'error_code' => $webhook->reconciliation_attempts >= self::MAX_RECONCILIATION_ATTEMPTS
                    ? 'reconciliation_attempt_limit_reached'
                    : 'payment_reconciliation_failed',
            ])->save();
        });

        Log::error('checkout.webhook.reconciliation_failed', [
            'event' => 'checkout.webhook.reconciliation_failed',
            'correlation_id' => $this->webhookId,
            'webhook_id' => $this->webhookId,
            'gateway' => 'mercadopago',
            'reason' => 'payment_reconciliation_failed',
            'exception_class' => $exception !== null ? $exception::class : null,
        ]);
    }
}
