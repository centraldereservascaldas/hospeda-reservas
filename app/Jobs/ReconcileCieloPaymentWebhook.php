<?php

namespace App\Jobs;

use App\Models\DirectBookingPaymentWebhook;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Client\RequestException;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Throwable;

class ReconcileCieloPaymentWebhook implements ShouldQueue
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
            if (! CieloDirectConfiguration::isProvider($webhook->gateway_provider)) {
                return false;
            }
            if (in_array($webhook->status, ['processed', 'processing'], true)) {
                return false;
            }
            if ($webhook->gateway_provider !== app(CieloDirectConfiguration::class)->provider()) {
                $webhook->forceFill(['status' => 'failed', 'error_code' => 'gateway_environment_mismatch'])->save();

                return false;
            }
            if ($webhook->reconciliation_attempts >= self::MAX_RECONCILIATION_ATTEMPTS) {
                $webhook->forceFill(['status' => 'failed', 'error_code' => 'reconciliation_attempt_limit_reached'])->save();

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
            $result = $payments->reconcileCieloPaymentId($webhook->gateway_payment_id);
            if ($result['status'] >= 500) {
                throw new \RuntimeException('Cielo payment reconciliation requires another attempt.');
            }

            $webhook->forceFill(['status' => 'processed', 'error_code' => null, 'processed_at' => now()])->save();
        } catch (Throwable $exception) {
            DB::transaction(function () use ($webhook): void {
                $lockedWebhook = DirectBookingPaymentWebhook::query()->lockForUpdate()->findOrFail($webhook->id);
                if ($lockedWebhook->status !== 'processed') {
                    $lockedWebhook->forceFill(['status' => 'retrying', 'error_code' => 'payment_reconciliation_failed'])->save();
                }
            });

            $failureCode = $exception instanceof RequestException
                ? 'payment_reconciliation_failed; gateway_http_status='.$exception->response->status()
                : 'payment_reconciliation_failed';
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
    }
}
