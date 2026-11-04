<?php

namespace App\Console\Commands;

use Illuminate\Cache\DatabaseStore;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class PruneStaysSearchCache extends Command
{
    protected $signature = 'stays:prune-search-cache';

    protected $description = 'Remove at most 2000 expired search snapshots without touching other cache entries';

    public function handle(): int
    {
        $name = (string) config('services.stays.search_cache_store', 'database');
        $store = Cache::store($name)->getStore();
        if (! $store instanceof DatabaseStore) {
            $this->line('Search cache pruning skipped: the configured store is not a database.');

            return self::SUCCESS;
        }
        $table = (string) config('cache.stores.'.$name.'.table', 'cache');
        $prefix = $store->getPrefix().'stays.search.';
        $expired = fn () => $store->getConnection()->table($table)
            ->where('expiration', '<=', now()->timestamp)
            ->whereRaw('substr(key, 1, ?) = ?', [mb_strlen($prefix), $prefix]);
        $deleted = 0;
        for ($batch = 0; $batch < 4; $batch++) {
            $keys = $expired()->orderBy('expiration')->orderBy('key')->limit(500)->pluck('key');
            if ($keys->isEmpty()) {
                break;
            }
            $deleted += $expired()->whereIn('key', $keys)->delete();
        }
        $this->info('Expired search snapshots removed: '.$deleted);

        return self::SUCCESS;
    }
}
