<?php

namespace App\Console\Commands;

use App\Models\DirectBookingOrder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;

#[Signature('direct-booking:prune-expired-resume-tokens')]
#[Description('Apaga credenciais de retomada expiradas e preserva os metadados de validade.')]
class PruneExpiredDirectBookingResumeTokens extends Command
{
    private const BATCH_SIZE = 500;

    private const MAX_BATCHES = 20;

    public function handle(): int
    {
        $pruned = 0;
        $processedBatches = 0;

        DirectBookingOrder::query()
            ->select('id')
            ->whereNotNull('resume_token')
            ->whereNotNull('resume_token_expires_at')
            ->where('resume_token_expires_at', '<=', now())
            ->orderBy('id')
            ->chunkById(self::BATCH_SIZE, function (Collection $orders) use (&$pruned, &$processedBatches): bool {
                $pruned += DirectBookingOrder::query()
                    ->whereKey($orders->pluck('id'))
                    ->whereNotNull('resume_token')
                    ->update(['resume_token' => null]);

                $processedBatches++;

                return $processedBatches < self::MAX_BATCHES;
            });

        $this->info("Credenciais de retomada expiradas removidas: {$pruned}.");

        $expiredTokensRemain = $processedBatches === self::MAX_BATCHES
            && DirectBookingOrder::query()
                ->whereNotNull('resume_token')
                ->whereNotNull('resume_token_expires_at')
                ->where('resume_token_expires_at', '<=', now())
                ->exists();

        if ($expiredTokensRemain) {
            $this->warn('O limite desta execução foi atingido; os demais tokens serão removidos na próxima execução.');
        }

        return self::SUCCESS;
    }
}
