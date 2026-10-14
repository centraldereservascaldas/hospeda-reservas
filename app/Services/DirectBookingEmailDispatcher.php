<?php

namespace App\Services;

use App\Jobs\SendDirectBookingConfirmationEmail;
use App\Models\DirectBookingEmail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class DirectBookingEmailDispatcher
{
    public function dispatch(string $emailId, bool $allowFreshPending = false): bool
    {
        $emailWasQueued = DB::transaction(function () use ($emailId, $allowFreshPending): bool {
            $email = DirectBookingEmail::query()->lockForUpdate()->findOrFail($emailId);
            $now = now();

            if ($email->status === 'sent') {
                return false;
            }

            if ($email->created_at?->lte($now->copy()->subHours(DirectBookingEmail::RETRY_WINDOW_HOURS))) {
                $email->forceFill([
                    'status' => 'failed',
                    'queued_at' => null,
                    'next_attempt_at' => null,
                    'error_code' => 'mail_retry_window_expired',
                ])->save();

                return false;
            }

            $canDispatch = match ($email->status) {
                'pending' => ($email->next_attempt_at === null || $email->next_attempt_at->lessThanOrEqualTo($now))
                    && ($allowFreshPending || $email->created_at?->lte($now->copy()->subMinutes(DirectBookingEmail::STALE_PENDING_MINUTES))),
                'failed' => $email->next_attempt_at?->lessThanOrEqualTo($now) ?? false,
                'processing' => $email->last_attempt_at?->lte($now->copy()->subMinutes(DirectBookingEmail::STALE_PROCESSING_MINUTES)) ?? false,
                'queued' => $email->queued_at?->lte($now->copy()->subMinutes(DirectBookingEmail::STALE_QUEUED_MINUTES)) ?? false,
                default => false,
            };

            if (! $canDispatch) {
                return false;
            }

            $email->forceFill([
                'status' => 'queued',
                'queued_at' => $now,
                'next_attempt_at' => null,
                'error_code' => null,
            ])->save();

            return true;
        });

        if (! $emailWasQueued) {
            return false;
        }

        try {
            SendDirectBookingConfirmationEmail::dispatch($emailId);

            return true;
        } catch (Throwable $exception) {
            DirectBookingEmail::query()
                ->whereKey($emailId)
                ->where('status', 'queued')
                ->update([
                    'status' => 'pending',
                    'queued_at' => null,
                    'next_attempt_at' => now()->addMinute(),
                    'error_code' => 'mail_queue_unavailable',
                    'updated_at' => now(),
                ]);

            Log::warning('Direct booking confirmation email could not be queued.', [
                'error_code' => 'mail_queue_unavailable',
                'exception_class' => $exception::class,
            ]);

            return false;
        }
    }
}
