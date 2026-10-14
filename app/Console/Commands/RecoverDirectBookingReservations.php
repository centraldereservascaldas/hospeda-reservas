<?php

namespace App\Console\Commands;

use App\Services\DirectStaysReservationService;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('direct-booking:recover-reservations')]
#[Description('Reconcilia pré-reservas, pagamentos aprovados e retenções expiradas na Stays.')]
class RecoverDirectBookingReservations extends Command
{
    public function handle(DirectCheckoutPaymentService $payments, DirectStaysReservationService $reservations): int
    {
        $paymentRecovery = $payments->recoverPendingPayments();
        $reservationRecovery = $reservations->recover();
        $result = [
            'processed' => $paymentRecovery['processed'] + $reservationRecovery['processed'],
            'attention' => $paymentRecovery['attention'] + $reservationRecovery['attention'],
        ];
        $this->info("Ações processadas: {$result['processed']}; em atenção: {$result['attention']}.");

        if ($result['attention'] > 0) {
            $this->warn('Há pedidos que precisam de conferência operacional.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
