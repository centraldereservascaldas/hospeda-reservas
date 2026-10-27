<?php

namespace App\Jobs;

use App\Mail\DirectBookingConfirmed;
use App\Models\DirectBookingEmail;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class SendDirectBookingConfirmationEmail implements ShouldQueue
{
    use Queueable;

    public int $timeout = 45;

    public array $backoff = [30, 120, 300];

    public function retryUntil(): DateTimeInterface
    {
        $createdAt = DirectBookingEmail::query()->find($this->emailId)?->created_at;

        return $createdAt?->addHours(DirectBookingEmail::RETRY_WINDOW_HOURS) ?? now();
    }

    public function __construct(public readonly string $emailId)
    {
        $this->onConnection((string) config('direct-booking.notification_queue_connection', 'database'));
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping('direct-booking-email:'.$this->emailId, 30, $this->timeout + 15))->shared()];
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        if (! config('direct-booking.send_confirmation_email', false)) {
            return;
        }

        $email = null;
        try {
            $email = DB::transaction(function (): ?DirectBookingEmail {
                $email = DirectBookingEmail::query()->lockForUpdate()->findOrFail($this->emailId);
                if ($email->status !== 'sent'
                    && $email->created_at?->lte(now()->subHours(DirectBookingEmail::RETRY_WINDOW_HOURS))) {
                    $email->forceFill([
                        'status' => 'failed',
                        'queued_at' => null,
                        'next_attempt_at' => null,
                        'error_code' => 'mail_retry_window_expired',
                    ])->save();

                    return null;
                }
                if ($email->status === 'sent'
                    || ($email->status === 'failed' && $email->next_attempt_at?->isFuture())
                    || ($email->status === 'pending' && $email->next_attempt_at?->isFuture())
                    || ($email->status === 'queued'
                        && $email->queued_at?->isAfter(now()->subMinutes(DirectBookingEmail::STALE_QUEUED_MINUTES)))
                    || ($email->status === 'processing'
                        && $email->last_attempt_at?->isAfter(now()->subMinutes(DirectBookingEmail::STALE_PROCESSING_MINUTES)))) {
                    return null;
                }

                $nextAttemptNumber = $email->attempts + 1;
                if ($email->created_at?->copy()->addSeconds(min(3600, 30 * (2 ** min(max($nextAttemptNumber - 1, 0), 7))))
                    ->greaterThanOrEqualTo($email->created_at->copy()->addHours(DirectBookingEmail::RETRY_WINDOW_HOURS))) {
                    $email->forceFill([
                        'status' => 'failed',
                        'queued_at' => null,
                        'next_attempt_at' => null,
                        'error_code' => 'mail_retry_window_expired',
                    ])->save();

                    return null;
                }

                $email->forceFill([
                    'status' => 'processing',
                    'queued_at' => null,
                    'attempts' => $nextAttemptNumber,
                    'last_attempt_at' => now(),
                    'next_attempt_at' => null,
                    'error_code' => null,
                ])->save();

                return $email->load('order');
            });

            if ($email === null) {
                return;
            }

            Mail::to($email->order->guest_email)->send(new DirectBookingConfirmed($email->order));

            DirectBookingEmail::query()
                ->whereKey($email->id)
                ->where('status', 'processing')
                ->update([
                    'status' => 'sent',
                    'queued_at' => null,
                    'sent_at' => now(),
                    'next_attempt_at' => null,
                    'error_code' => null,
                    'updated_at' => now(),
                ]);
        } catch (Throwable $exception) {
            if ($email instanceof DirectBookingEmail) {
                $retrySeconds = min(3600, 30 * (2 ** min(max($email->attempts - 1, 0), 7)));
                $nextAttemptAt = now()->addSeconds($retrySeconds);
                if ($nextAttemptAt->greaterThanOrEqualTo($email->created_at->copy()->addHours(DirectBookingEmail::RETRY_WINDOW_HOURS))) {
                    $email->forceFill([
                        'status' => 'failed',
                        'queued_at' => null,
                        'next_attempt_at' => null,
                        'error_code' => 'mail_retry_window_expired',
                    ])->save();
                } else {
                    $email->forceFill([
                        'status' => 'failed',
                        'queued_at' => null,
                        'next_attempt_at' => $nextAttemptAt,
                        'error_code' => 'mail_delivery_failed',
                    ])->save();
                }
            }

            throw $exception;
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::error('Direct booking confirmation email reached terminal failure.', [
            'error_code' => 'mail_delivery_failed',
            'exception_class' => $exception !== null ? $exception::class : null,
        ]);

        DirectBookingEmail::query()
            ->whereKey($this->emailId)
            ->whereIn('status', ['queued', 'processing'])
            ->update([
                'status' => 'failed',
                'queued_at' => null,
                'next_attempt_at' => null,
                'error_code' => 'mail_delivery_failed',
                'updated_at' => now(),
            ]);
    }
}
