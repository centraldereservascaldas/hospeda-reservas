<?php

namespace App\Services;

use DateTimeImmutable;

class StaysSearchQuoteService
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    /**
     * @param  list<array<string, mixed>>  $listings
     * @return array{items: list<array<string, mixed>>, unquotedCount: int}
     */
    public function resolve(array $listings, string $from, string $to, int $guests): array
    {
        $listings = array_values(array_filter($listings, static fn (array $listing): bool => ($listing['isBookable'] ?? null) !== false
            && (! isset($listing['_i_maxGuests']) || ! is_numeric($listing['_i_maxGuests']) || (float) $listing['_i_maxGuests'] >= $guests)));
        $quotes = [];
        $missingIds = [];
        foreach ($listings as $index => $listing) {
            $price = is_array($listing['bookingPrice'] ?? null) ? $listing['bookingPrice'] : [];
            $ids = $this->listingIds($listing);
            $priceId = $price['_idlisting'] ?? $price['listingId'] ?? null;
            $quotes[$index] = $ids !== [] && ($priceId === null || in_array($priceId, $ids, true))
                ? $this->normalize($price, $from, $to, $guests, $listing['dailyRate'] ?? null)
                : null;
            if ($quotes[$index] === null) {
                if ($ids !== []) {
                    $missingIds[] = $ids[0];
                }
            }
        }

        $calculated = [];
        if ($missingIds !== []) {
            $response = $this->stays->post('/booking/calculate-price', [
                'listingIds' => array_values(array_unique($missingIds)),
                'from' => $from,
                'to' => $to,
                'guests' => $guests,
            ], timeout: 5);
            if (is_array($response) && array_is_list($response)) {
                $calculated = $response;
            }
        }

        $items = [];
        $unquotedCount = 0;
        foreach ($listings as $index => $listing) {
            $quote = $quotes[$index];
            if ($quote === null) {
                $ids = $this->listingIds($listing);
                $matches = array_values(array_filter($calculated, static fn (mixed $candidate): bool => is_array($candidate)
                    && in_array($candidate['_idlisting'] ?? $candidate['listingId'] ?? null, $ids, true)));
                if (count($matches) === 1) {
                    $quote = $this->normalize($matches[0], $from, $to, $guests);
                }
            }
            if ($quote === null) {
                $unquotedCount++;

                continue;
            }

            $listing['calculatedPrice'] = $quote;
            $items[] = $listing;
        }

        return ['items' => $items, 'unquotedCount' => $unquotedCount];
    }

    /**
     * @param  array<string, mixed>  $listing
     * @return list<string>
     */
    private function listingIds(array $listing): array
    {
        return array_values(array_unique(array_filter([
            $listing['id'] ?? null, $listing['code'] ?? null, $listing['_id'] ?? null,
        ], static fn (mixed $id): bool => is_string($id) && trim($id) !== '')));
    }

    /**
     * @param  array<string, mixed>  $price
     * @return array<string, mixed>|null
     */
    private function normalize(array $price, string $from, string $to, int $guests, mixed $nightly = null): ?array
    {
        if ((isset($price['from']) && $price['from'] !== $from)
            || (isset($price['to']) && $price['to'] !== $to)
            || (isset($price['guests']) && (! is_numeric($price['guests']) || (float) $price['guests'] !== (float) $guests))) {
            return null;
        }

        $amounts = is_array($price['_mctotal'] ?? null) ? $price['_mctotal'] : [];
        $totalCents = MoneyAmount::toCents($amounts['BRL'] ?? null);
        $feesIncluded = $price['feesIncluded'] ?? null;
        $fees = $price['fees'] ?? [];
        if ($totalCents === null || $totalCents <= 0 || ! is_bool($feesIncluded)
            || ! is_array($fees) || ! array_is_list($fees)
            || (! $feesIncluded && ! array_key_exists('fees', $price))) {
            return null;
        }

        $feeCents = 0;
        $cleaningCents = 0;
        $normalizedFees = [];
        foreach ($fees as $fee) {
            $values = is_array($fee) && is_array($fee['_mcval'] ?? null) ? $fee['_mcval'] : [];
            $amount = MoneyAmount::toCents($values['BRL'] ?? null);
            if ($amount === null) {
                return null;
            }
            $feeCents += $amount;
            $titles = is_array($fee['_mstitle'] ?? null) ? $fee['_mstitle'] : [];
            $name = is_string($fee['internalName'] ?? null) ? $fee['internalName'] : '';
            $title = is_string($titles['pt_BR'] ?? null) ? $titles['pt_BR'] : '';
            if (preg_match('/clean|limpez/i', $name.' '.$title) === 1) {
                $cleaningCents += $amount;
            }
            $normalizedFees[] = [
                'internalName' => $name,
                '_mstitle' => array_filter($titles, 'is_string'),
                '_mcval' => ['BRL' => $amount / 100],
            ];
        }

        $nights = (int) (new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days;
        $subtotals = is_array($price['_mcsubtotal'] ?? null) ? $price['_mcsubtotal'] : [];
        $subtotal = MoneyAmount::toCents($subtotals['BRL'] ?? null);
        if (array_key_exists('BRL', $subtotals) && $subtotal === null) {
            return null;
        }
        $baseCents = $subtotal ?? ($totalCents - ($feesIncluded ? $feeCents : 0));
        $daily = $subtotal !== null
            ? $subtotal / 100 / max(1, $nights)
            : (is_numeric($nightly) && is_finite((float) $nightly) && (float) $nightly > 0
                ? (float) $nightly
                : $baseCents / 100 / max(1, $nights));
        if ($nights < 1 || $baseCents <= 0 || ! is_finite($daily) || $daily <= 0) {
            return null;
        }

        return [
            'nights' => $nights,
            'dailyRate' => $daily,
            'basePrice' => $baseCents / 100,
            'cleaningFee' => $cleaningCents / 100,
            'serviceFee' => ($feeCents - $cleaningCents) / 100,
            'totalAmount' => ($totalCents + ($feesIncluded ? 0 : $feeCents)) / 100,
            'currency' => 'BRL',
            'fees' => $normalizedFees,
        ];
    }
}
