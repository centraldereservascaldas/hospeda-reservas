<?php

namespace App\Console\Commands;

use App\Jobs\RefreshStaysAccommodationCatalog;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysExternalApiClient;
use Illuminate\Console\Command;

class QueueStaysCatalogRefresh extends Command
{
    protected $signature = 'stays:queue-catalog-refresh';

    protected $description = 'Queue a deduplicated descriptive catalog refresh on the discovery worker';

    public function handle(StaysAccommodationCatalog $catalog, StaysExternalApiClient $stays): int
    {
        if (! $stays->isConfigured()) {
            $this->line('Catalog refresh skipped: Stays is not configured.');

            return self::SUCCESS;
        }
        RefreshStaysAccommodationCatalog::dispatch($catalog->key());
        $this->info('Catalog refresh requested on discovery.');

        return self::SUCCESS;
    }
}
