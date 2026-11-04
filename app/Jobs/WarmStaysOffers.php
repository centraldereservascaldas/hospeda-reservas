<?php

namespace App\Jobs;

use App\Services\StaysOfferWarmup;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class WarmStaysOffers implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 45;

    public int $uniqueFor = 120;

    public bool $failOnTimeout = true;

    public function __construct(public readonly string $accountKey)
    {
        $this->onConnection('database')->onQueue('discovery');
    }

    public function uniqueId(): string
    {
        return $this->accountKey;
    }

    public function uniqueVia(): Repository
    {
        return app(StaysOfferWarmup::class)->cache();
    }

    public function handle(StaysOfferWarmup $warmup): void
    {
        if ($this->accountKey !== $warmup->key()) {
            return;
        }
        $started = hrtime(true);
        $result = $warmup->warmOne();
        Log::info('Stays offer warmup completed.', [
            ...$result,
            'elapsedMs' => (int) ((hrtime(true) - $started) / 1_000_000),
            'peakMemoryBytes' => memory_get_peak_usage(true),
        ]);
    }
}
