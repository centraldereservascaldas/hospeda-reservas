<?php

namespace App\Services;

class BrazilianPhone
{
    public static function isValid(string $value): bool
    {
        return self::normalize($value) !== null;
    }

    public static function normalize(string $value): ?string
    {
        $value = trim($value);
        if (! preg_match('/^\+?[0-9 ()-]+$/D', $value)) {
            return null;
        }
        $digits = preg_replace('/\D/', '', $value);
        if (str_starts_with($value, '+') && (! str_starts_with($digits, '55') || ! in_array(strlen($digits), [12, 13], true))) {
            return null;
        }
        if (in_array(strlen($digits), [12, 13], true) && str_starts_with($digits, '55')) {
            $digits = substr($digits, 2);
        }

        $ddd = substr($digits, 0, 2);
        $validDdds = ['11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '28', '31', '32', '33', '34', '35', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48', '49', '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68', '69', '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87', '88', '89', '91', '92', '93', '94', '95', '96', '97', '98', '99'];
        if (! in_array($ddd, $validDdds, true)) {
            return null;
        }

        $subscriber = substr($digits, 2);

        $valid = (strlen($digits) === 11 && preg_match('/^9[6-9][0-9]{7}$/D', $subscriber) === 1)
            || (strlen($digits) === 10 && preg_match('/^[2-5][0-9]{7}$/D', $subscriber) === 1);

        return $valid ? $digits : null;
    }
}
