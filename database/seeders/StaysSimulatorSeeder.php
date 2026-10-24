<?php

namespace Database\Seeders;

use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class StaysSimulatorSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $connection = DB::connection('stays_simulator');
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $fixtures = array_slice($catalog, 0, 3);
        $rates = [350.0, 285.0, 395.0];
        $seededAt = now();

        foreach ($fixtures as $index => $property) {
            $listingId = (string) $property['id'];
            $dailyRate = $rates[$index] ?? 320.0;
            $property['pricePerNight'] = $dailyRate;
            $property['cleaningFee'] = 95.0;
            $property['serviceFeeRate'] = 0.08;
            $property['isSuperhost'] = false;
            $property['isGuestFavorite'] = false;
            $property['staysSynced'] = false;
            $property['reviewsSynced'] = false;
            $property['rating'] = 0;
            $property['reviewCount'] = 0;
            $property['reviews'] = [];
            $property['host']['isSuperhost'] = false;
            $property['simulatedData'] = true;
            $property['dataSource'] = 'stays-simulated';

            $connection->table('stays_simulator_listings')->updateOrInsert(
                ['listing_id' => $listingId],
                [
                    'property_data' => json_encode($property, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                    'daily_rate' => $dailyRate,
                    'cleaning_fee' => 95.0,
                    'service_fee_rate' => 0.08,
                    'max_guests' => (int) $property['maxGuests'],
                    'active' => true,
                    'created_at' => $seededAt,
                    'updated_at' => $seededAt,
                ],
            );

            $connection->table('stays_simulator_calendar_days')->where('listing_id', $listingId)->delete();
            $start = CarbonImmutable::today();
            for ($offset = 0; $offset <= 400; $offset++) {
                $date = $start->addDays($offset);
                $weekday = (int) $date->dayOfWeek;
                $blocked = (($offset + ($index * 5)) % 31) >= 12 && (($offset + ($index * 5)) % 31) <= 14;
                $dailyRateForDate = $dailyRate + ($weekday === 5 || $weekday === 6 ? 35.0 : 0.0);

                $connection->table('stays_simulator_calendar_days')->insert([
                    'listing_id' => $listingId,
                    'date' => $date->toDateString(),
                    'available' => ! $blocked,
                    'daily_rate' => $dailyRateForDate,
                    'min_stay' => $weekday === 5 ? 2 : 1,
                    'closed_to_arrival' => false,
                    'closed_to_departure' => false,
                    'created_at' => $seededAt,
                    'updated_at' => $seededAt,
                ]);
            }
        }
    }
}
