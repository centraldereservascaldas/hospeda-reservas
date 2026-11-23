<?php

namespace App\Console\Commands;

use App\Models\DirectBookingOrder;
use App\Services\ExistingCheckoutRecoveryCredential;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

#[Signature('direct-booking:prune-existing-checkout-recovery-credentials')]
#[Description('Remove expired checkout recovery credentials without valid resume tokens')]
class PruneExistingCheckoutRecoveryCredentials extends Command
{
    public function handle(): int
    {
        $cutoff = now()->subDays(ExistingCheckoutRecoveryCredential::RETENTION_DAYS);
        $hashes = DB::table('existing_checkout_recovery_credentials')
            ->where('created_at', '<=', $cutoff)
            ->whereNotExists(function (Builder $query): void {
                $query->selectRaw('1')->from('direct_booking_orders')
                    ->whereColumn('direct_booking_orders.existing_checkout_recovery_hash', 'existing_checkout_recovery_credentials.credential_hash')
                    ->where('direct_booking_orders.resume_token_expires_at', '>', now());
            })
            ->orderBy('created_at')
            ->orderBy('credential_hash')
            ->limit(500)
            ->pluck('credential_hash');

        foreach ($hashes as $hash) {
            DB::transaction(function () use ($hash, $cutoff): void {
                $credential = DB::table('existing_checkout_recovery_credentials')
                    ->where('credential_hash', $hash)
                    ->where('created_at', '<=', $cutoff)
                    ->lockForUpdate()
                    ->first();
                if ($credential === null) {
                    return;
                }

                $order = DirectBookingOrder::query()->where('existing_checkout_recovery_hash', $hash)->first();
                if ($order !== null && $order->hasValidResumeToken($order->resume_token ?? '')) {
                    return;
                }

                DB::table('existing_checkout_recovery_credentials')->where('credential_hash', $hash)->delete();
            });
        }

        return self::SUCCESS;
    }
}
