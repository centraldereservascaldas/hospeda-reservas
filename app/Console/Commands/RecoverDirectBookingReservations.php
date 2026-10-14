<?php

namespace App\Console\Commands;

use App\Services\DirectStaysReservationService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('direct-booking:recover-reservations')]
#[Description('Reconcilia pré-reservas, pagamentos aprovados e retenções expiradas na Stays.')]
class RecoverDirectBookingReservations extends Command
{
    public function handle(DirectStaysReservationService $reservations): int
    {
        $result = $reservations->recover();
        $this->info("Ações processadas: {$result['processed']}; em atenção: {$result['attention']}.");

        return self::SUCCESS;
    }
}
