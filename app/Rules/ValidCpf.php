<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Translation\PotentiallyTranslatedString;

class ValidCpf implements ValidationRule
{
    /**
     * Run the validation rule.
     *
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! self::isValid($value)) {
            $fail('Informe um CPF válido.');
        }
    }

    public static function isCpfDocument(string $value): bool
    {
        return preg_match('/^[0-9.\s-]+$/', $value) === 1
            && strlen(preg_replace('/\D+/', '', $value) ?? '') === 11;
    }

    public static function isValid(string $value): bool
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';
        if (strlen($digits) !== 11 || preg_match('/^(\d)\1{10}$/', $digits) === 1) {
            return false;
        }

        for ($position = 9; $position <= 10; $position++) {
            $sum = 0;
            for ($index = 0; $index < $position; $index++) {
                $sum += (int) $digits[$index] * (($position + 1) - $index);
            }
            $remainder = ($sum * 10) % 11;
            $checkDigit = $remainder === 10 ? 0 : $remainder;
            if ((int) $digits[$position] !== $checkDigit) {
                return false;
            }
        }

        return true;
    }
}
