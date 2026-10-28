<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class StaysSimulator
{
    private const CONNECTION = 'stays_simulator';

    public function enabled(): bool
    {
        return app()->environment(['local', 'testing'])
            && (bool) config('services.stays_simulator.enabled', false);
    }

    /** @return array<int, array<string, mixed>> */
    public function catalog(): array
    {
        return DB::connection(self::CONNECTION)
            ->table('stays_simulator_listings')
            ->where('active', true)
            ->orderBy('listing_id')
            ->get()
            ->map(fn (object $row): array => $this->propertyFromRow($row))
            ->all();
    }

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        $row = DB::connection(self::CONNECTION)
            ->table('stays_simulator_listings')
            ->where('active', true)
            ->where(function ($query) use ($id): void {
                $query->where('listing_id', $id)
                    ->orWhereRaw("json_extract(property_data, '$.staysListingId') = ?", [$id]);
            })
            ->first();

        return $row ? $this->propertyFromRow($row) : null;
    }

    /** @return array<int, array<string, mixed>> */
    public function calendar(string $listingId, string $from, string $to): array
    {
        return DB::connection(self::CONNECTION)
            ->table('stays_simulator_calendar_days')
            ->where('listing_id', $listingId)
            ->whereBetween('date', [$from, $to])
            ->orderBy('date')
            ->get()
            ->map(fn (object $day): array => [
                'date' => $day->date,
                'avail' => (int) $day->available,
                'closedToArrival' => (bool) $day->closed_to_arrival,
                'closedToDeparture' => (bool) $day->closed_to_departure,
                'prices' => [[
                    'minStay' => (int) $day->min_stay,
                    '_mcval' => ['BRL' => (float) $day->daily_rate],
                ]],
            ])
            ->all();
    }

    /** @return array<string, mixed>|null */
    public function quote(string $listingId, string $from, string $to, int $guests): ?array
    {
        $row = DB::connection(self::CONNECTION)
            ->table('stays_simulator_listings')
            ->where('active', true)
            ->where(function ($query) use ($listingId): void {
                $query->where('listing_id', $listingId)
                    ->orWhereRaw("json_extract(property_data, '$.staysListingId') = ?", [$listingId]);
            })
            ->first();
        if (! $row) {
            return null;
        }

        $property = $this->propertyFromRow($row);
        $nights = (int) CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to));
        $days = DB::connection(self::CONNECTION)
            ->table('stays_simulator_calendar_days')
            ->where('listing_id', $row->listing_id)
            ->whereBetween('date', [$from, $to])
            ->orderBy('date')
            ->get();
        if ($days->count() !== $nights + 1) {
            return ['available' => false, 'property' => $property];
        }

        $checkIn = $days->first();
        $checkOut = $days->last();
        if ($guests > (int) $row->max_guests) {
            return ['available' => false, 'reason' => 'invalid_guest_count', 'property' => $property];
        }
        if ((bool) $checkIn->closed_to_arrival
            || (bool) $checkOut->closed_to_departure
            || (int) $checkIn->min_stay > $nights
            || $days->take($nights)->contains(fn (object $day): bool => ! (bool) $day->available)) {
            return ['available' => false, 'property' => $property];
        }

        $base = (float) $days->take($nights)->sum('daily_rate');
        $cleaning = (float) $row->cleaning_fee;
        $service = (int) round($base * (float) $row->service_fee_rate);
        $total = $base + $cleaning + $service;
        $dailyRate = $base / $nights;
        $property['pricePerNight'] = (float) $row->daily_rate;
        $property['calculatedPrice'] = [
            'nights' => $nights,
            'dailyRate' => $dailyRate,
            'basePrice' => $base,
            'cleaningFee' => $cleaning,
            'serviceFee' => $service,
            'totalAmount' => $total,
            'currency' => 'BRL',
        ];

        return [
            'available' => true,
            'property' => $property,
            'quote' => [
                'success' => true,
                'listingId' => $property['id'],
                'staysListingId' => $property['staysListingId'] ?? $property['id'],
                'nights' => $nights,
                'dailyRate' => $dailyRate,
                'baseTotal' => $base,
                'cleaningFee' => $cleaning,
                'serviceFee' => $service,
                'discount' => 0,
                'total' => $total,
                'currency' => 'BRL',
                'source' => 'stays-simulated',
                'feesIncluded' => false,
                'fees' => [],
                'cleaningIncluded' => false,
                'breakdown' => [
                    'dailyRateText' => 'R$ '.number_format($dailyRate, 2, ',', '.').' por noite em média × '.$nights.' noites',
                    'cleaningFeeText' => 'Taxa de limpeza simulada',
                    'serviceFeeText' => 'Taxa de serviço simulada',
                    'totalText' => 'R$ '.number_format($total, 2, ',', '.'),
                ],
            ],
        ];
    }

    /** @param object{listing_id: string, property_data: string, daily_rate: string|float} $row
     * @return array<string, mixed>
     */
    private function propertyFromRow(object $row): array
    {
        $property = json_decode($row->property_data, true, flags: JSON_THROW_ON_ERROR);
        $property['pricePerNight'] = (float) $row->daily_rate;

        return $property;
    }
}
