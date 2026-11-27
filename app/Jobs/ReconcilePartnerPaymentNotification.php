<?php

namespace App\Jobs;

use App\Models\PartnerPaymentNotification;
use App\Services\PartnerPaymentReconciliationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class ReconcilePartnerPaymentNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public int $timeout = 80;

    public function __construct(public readonly string $notificationId) {}

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 30, 90, 180];
    }

    public function handle(PartnerPaymentReconciliationService $payments): void
    {
        DB::transaction(function (): void {
            $notification = PartnerPaymentNotification::query()->lockForUpdate()->findOrFail($this->notificationId);
            if ($notification->status === 'processed') {
                return;
            }

            $notification->forceFill([
                'status' => 'processing',
                'error_code' => null,
                'reconciliation_attempts' => $notification->reconciliation_attempts + 1,
            ])->save();
        });

        $notification = PartnerPaymentNotification::query()->findOrFail($this->notificationId);
        try {
            if (! $notification->partner_checkout_order_id) {
                throw new RuntimeException('partner_order_missing');
            }

            $payments->reconcile((string) $notification->partner_checkout_order_id);
            $notification->forceFill(['status' => 'processed', 'error_code' => null, 'processed_at' => now()])->save();
        } catch (Throwable $exception) {
            $notification->forceFill(['status' => 'retrying', 'error_code' => 'payment_reconciliation_failed'])->save();
            throw new RuntimeException('Partner payment notification reconciliation failed.', previous: $exception);
        }
    }

    public function failed(?Throwable $exception): void
    {
        $notification = PartnerPaymentNotification::query()->find($this->notificationId);
        if ($notification === null || $notification->status === 'processed') {
            return;
        }

        $notification->forceFill([
            'status' => 'failed',
            'error_code' => 'payment_reconciliation_failed',
        ])->save();
    }
}
