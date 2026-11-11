<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

#[Signature('checkout:inventory-ambiguous-reservations')]
#[Description('Counts locally unresolved reservation references without changing data or calling Stays')]
class InventoryAmbiguousReservations extends Command
{
    public function handle(): int
    {
        if (! Schema::hasTable('direct_booking_orders')) {
            $this->error('Orders table is missing; no inventory was produced.');

            return self::FAILURE;
        }

        $aliasesAvailable = Schema::hasTable('stays_reservation_aliases');
        $count = 0;
        DB::table('direct_booking_orders')->whereNotNull('stays_reservation_id')
            ->select(['id', 'stays_reservation_id'])
            ->chunkById(500, function ($orders) use ($aliasesAvailable, &$count): void {
                $references = $orders->pluck('stays_reservation_id')->filter(
                    fn (string $reference): bool => ! preg_match('/^[a-f0-9]{24}$/iD', $reference)
                )->unique()->values();
                $verified = $aliasesAvailable && $references->isNotEmpty()
                    ? DB::table('stays_reservation_aliases')->whereIn('reservation_code', $references)->pluck('reservation_code')->all()
                    : [];
                foreach ($orders as $order) {
                    $reference = $order->stays_reservation_id;
                    // Codes are case-sensitive, even on databases with case-insensitive collation.
                    if (! preg_match('/^[a-f0-9]{24}$/iD', $reference) && ! in_array($reference, $verified, true)) {
                        $count++;
                    }
                }
            });
        $this->line(json_encode(['unresolved_orders' => $count, 'aliases_available' => $aliasesAvailable], JSON_THROW_ON_ERROR));
        $this->warn('Inventory only: no identity was verified or changed.');

        return self::SUCCESS;
    }
}
