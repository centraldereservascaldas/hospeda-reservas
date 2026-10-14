<?php

namespace App\Services;

class MoneyAmount
{
    public static function toCents(mixed $amount): ?int
    {
        if (! is_int($amount) && ! is_float($amount) && ! is_string($amount)) {
            return null;
        }

        if (! is_numeric($amount) || ! is_finite((float) $amount) || (float) $amount < 0) {
            return null;
        }

        $normalized = is_float($amount) ? number_format($amount, 2, '.', '') : trim($amount);
        if (! preg_match('/^\d{1,8}(?:\.\d{1,2})?$/', $normalized)) {
            return null;
        }

        if (is_float($amount) && abs((float) $normalized - $amount) > 0.000001) {
            return null;
        }

        [$whole, $fraction] = array_pad(explode('.', $normalized, 2), 2, '');

        return ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');
    }
}
