<?php

namespace App\Console\Commands;

use App\Services\StaysDiscoveryCatalog;
use Illuminate\Console\Command;
use Illuminate\Contracts\Cache\LockTimeoutException;
use RuntimeException;

class SyncStaysDiscovery extends Command
{
    protected $signature = 'stays:sync-discovery';

    protected $description = 'Atualiza conteúdo público e páginas de descoberta sem alterar registros na Stays';

    public function handle(StaysDiscoveryCatalog $catalog): int
    {
        try {
            $snapshot = $catalog->sync();
        } catch (RuntimeException|LockTimeoutException) {
            $this->error('Sincronização incompleta. A última versão válida foi preservada até seu vencimento.');

            return self::FAILURE;
        }
        $this->info(count($snapshot['properties']).' empreendimentos e '.count($snapshot['listings']).' acomodações sincronizados.');

        return self::SUCCESS;
    }
}
