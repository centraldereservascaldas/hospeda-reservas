<?php

namespace App\Console\Commands;

use App\Models\DirectBookingEmail;
use App\Services\DirectBookingEmailDispatcher;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('direct-booking:recover-confirmation-emails')]
#[Description('Reenfileira e-mails transacionais de confirmação pendentes ou recuperáveis.')]
class RecoverDirectBookingConfirmationEmails extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(DirectBookingEmailDispatcher $dispatcher): int
    {
        DirectBookingEmail::query()
            ->whereNotIn('status', ['sent', 'skipped'])
            ->where('created_at', '<=', now()->subHours(DirectBookingEmail::RETRY_WINDOW_HOURS))
            ->where(function ($query): void {
                $query->where('status', '!=', 'failed')
                    ->orWhereNotNull('next_attempt_at');
            })
            ->update([
                'status' => 'failed',
                'queued_at' => null,
                'next_attempt_at' => null,
                'error_code' => 'mail_retry_window_expired',
                'updated_at' => now(),
            ]);

        $recoverableEmails = DirectBookingEmail::query()
            ->where('created_at', '>', now()->subHours(DirectBookingEmail::RETRY_WINDOW_HOURS))
            ->where(function ($query): void {
                $query->where(fn ($query) => $query->where('status', 'pending')
                    ->where('created_at', '<=', now()->subMinutes(DirectBookingEmail::STALE_PENDING_MINUTES))
                    ->where(fn ($query) => $query->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now())))
                    ->orWhere(fn ($query) => $query->where('status', 'failed')
                        ->whereNotNull('next_attempt_at')
                        ->where('next_attempt_at', '<=', now()))
                    ->orWhere(fn ($query) => $query->where('status', 'processing')
                        ->where('last_attempt_at', '<=', now()->subMinutes(DirectBookingEmail::STALE_PROCESSING_MINUTES)))
                    ->orWhere(fn ($query) => $query->where('status', 'queued')
                        ->where('queued_at', '<=', now()->subMinutes(DirectBookingEmail::STALE_QUEUED_MINUTES)));
            })
            ->orderBy('id')
            ->limit(100)
            ->pluck('id');

        foreach ($recoverableEmails as $emailId) {
            $dispatcher->dispatch((string) $emailId);
        }

        $this->info('E-mails de confirmação recuperáveis verificados: '.$recoverableEmails->count().'.');

        return self::SUCCESS;
    }
}
