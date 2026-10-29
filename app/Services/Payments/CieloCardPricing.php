<?php

namespace App\Services\Payments;

use App\Services\MoneyAmount;
use InvalidArgumentException;

class CieloCardPricing
{
    /** @return array{baseCents: int, feeCents: int, totalCents: int, rateBasisPoints: int} */
    public function calculate(mixed $baseAmount, int $installments): array
    {
        $baseCents = MoneyAmount::toCents($baseAmount);
        if ($baseCents === null || $baseCents < 1 || $installments < 1 || $installments > 6) {
            throw new InvalidArgumentException('Invalid Cielo card pricing input.');
        }

        $rateBasisPoints = match (true) {
            $installments === 1 => 599,
            $installments <= 3 => 1250,
            default => 1800,
        };
        $divisor = 10_000 - $rateBasisPoints;
        $totalCents = intdiv(($baseCents * 10_000) + $divisor - 1, $divisor);

        return [
            'baseCents' => $baseCents,
            'feeCents' => $totalCents - $baseCents,
            'totalCents' => $totalCents,
            'rateBasisPoints' => $rateBasisPoints,
        ];
    }

    public function decimal(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }
}
