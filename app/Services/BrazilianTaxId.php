<?php

namespace App\Services;

use App\Rules\ValidCpf;

class BrazilianTaxId
{
    public static function isValid(string $type, string $number): bool
    {
        if ($type === 'CPF') {
            return preg_match('/^[0-9]{11}$/D', $number) === 1 && ValidCpf::isValid($number);
        }
        $number = strtoupper($number);
        if ($type !== 'CNPJ' || preg_match('/^[A-Z0-9]{12}[0-9]{2}$/D', $number) !== 1 || preg_match('/^(.)\1{13}$/D', $number) === 1) {
            return false;
        }
        $digits = substr($number, 0, 12);
        foreach ([[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]] as $weights) {
            $sum = 0;
            foreach ($weights as $index => $weight) {
                $sum += (ord($digits[$index]) - 48) * $weight;
            }
            $remainder = $sum % 11;
            $digits .= (string) ($remainder < 2 ? 0 : 11 - $remainder);
        }

        return hash_equals($number, $digits);
    }
}
