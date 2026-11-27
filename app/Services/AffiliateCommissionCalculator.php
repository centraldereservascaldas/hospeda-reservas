<?php

namespace App\Services;

class AffiliateCommissionCalculator
{
    public const VERSION = 'quote_total_basis_points_v1';

    public const DEFAULT_BASIS_POINTS = 350;

    public function calculateCents(string $quoteTotal, string $currency, ?int $basisPoints): ?int
    {
        if ($currency !== 'BRL' || ! preg_match('/^(\d{1,10})(?:\.(\d{1,2}))?$/', $quoteTotal, $matches)) {
            return null;
        }

        $quoteTotalCents = ((int) $matches[1] * 100) + (int) str_pad($matches[2] ?? '', 2, '0');
        $basisPoints ??= self::DEFAULT_BASIS_POINTS;

        if ($quoteTotalCents < 1 || $basisPoints < 1 || $basisPoints > 10000) {
            return null;
        }

        $commissionCents = intdiv(($quoteTotalCents * $basisPoints) + 5000, 10000);

        return $commissionCents > 0 ? $commissionCents : null;
    }
}
