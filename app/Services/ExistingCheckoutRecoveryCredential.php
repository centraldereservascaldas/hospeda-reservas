<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ExistingCheckoutRecoveryCredential
{
    public const RETENTION_DAYS = 7;

    public function expired(string $createdAt): bool
    {
        return Carbon::parse($createdAt)->lte(now()->subDays(self::RETENTION_DAYS));
    }

    public function issue(string $code): string
    {
        $nonce = bin2hex(random_bytes(32));

        $issuedAt = str_pad(dechex(now()->timestamp), 16, '0', STR_PAD_LEFT);
        $payload = $issuedAt.$nonce;
        $credential = $payload.$this->signature($code, $payload);
        DB::table('existing_checkout_recovery_credentials')->insert([
            'credential_hash' => $this->hash($credential),
            'reservation_code' => $code,
            'state' => 'issued',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $credential;
    }

    public function valid(string $code, string $credential): bool
    {
        if (! preg_match('/^[A-Z0-9]{5}$/D', $code) || ! preg_match('/^(?:[a-f0-9]{128}|[a-f0-9]{144})$/D', $credential)) {
            return false;
        }
        $payload = substr($credential, 0, -64);

        return hash_equals($this->signature($code, $payload), substr($credential, -64));
    }

    public function hasExpiredSignedIssueTime(string $credential): bool
    {
        if (! preg_match('/^[a-f0-9]{144}$/D', $credential)) {
            return false;
        }
        $issuedAt = hexdec(substr($credential, 0, 16));

        return is_int($issuedAt) && $issuedAt > 0 && $issuedAt <= now()->subDays(self::RETENTION_DAYS)->timestamp;
    }

    public function hash(string $credential): string
    {
        return hash_hmac('sha256', $credential, (string) config('app.key'));
    }

    private function signature(string $code, string $nonce): string
    {
        return hash_hmac('sha256', 'existing-checkout-recovery:'.$code.':'.$nonce, (string) config('app.key'));
    }
}
