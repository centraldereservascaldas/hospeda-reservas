<?php

namespace App\Jobs;

use App\Services\StaysAccommodationCatalog;
use App\Services\StaysContentRateLimited;
use App\Services\StaysExternalApiClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;

class RefreshStaysAccommodationCatalog implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public int $timeout = 45;

    public int $uniqueFor = 86460;

    public bool $failOnTimeout = true;

    public function __construct(public readonly string $catalogKey)
    {
        $this->onConnection('database')->onQueue('discovery');
    }

    public function uniqueId(): string
    {
        return $this->catalogKey;
    }

    public function uniqueVia(): Repository
    {
        return Cache::store((string) config('services.stays.content_cache_store', 'database'));
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [15, 60];
    }

    public function handle(StaysAccommodationCatalog $catalog, StaysExternalApiClient $stays): void
    {
        if ($this->catalogKey !== $catalog->key() || ! $stays->isConfigured()) {
            return;
        }
        try {
            $catalog->refresh(background: true);
        } catch (StaysContentRateLimited $limited) {
            $this->release($limited->retryAfterSeconds);
        }
    }
}
