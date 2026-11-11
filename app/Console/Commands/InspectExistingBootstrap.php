<?php

namespace App\Console\Commands;

use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationBootstrapRecovery;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

#[Signature('checkout:inspect-existing-bootstrap {order : UUID do pedido local}')]
#[Description('Inspeciona o estado local e o recebível Stays sem alterar pagamentos')]
class InspectExistingBootstrap extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(ExistingReservationBootstrapRecovery $recovery): int
    {
        $id = $this->argument('order');
        if (! is_string($id) || ! Str::isUuid($id)) {
            $this->error('Informe o UUID do pedido local.');

            return self::INVALID;
        }
        $order = DirectBookingOrder::query()->find($id);
        if ($order === null) {
            $this->error('Pedido não encontrado.');

            return self::FAILURE;
        }
        $this->line(json_encode($recovery->inspect($order), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return self::SUCCESS;
    }
}
