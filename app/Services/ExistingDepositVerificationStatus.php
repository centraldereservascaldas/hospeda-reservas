<?php

namespace App\Services;

class ExistingDepositVerificationStatus
{
    /** @param array<int, mixed> $events */
    public function requiresReview(array $events): bool
    {
        $generation = null;
        $result = null;
        foreach ($events as $event) {
            if (! is_array($event)) {
                continue;
            }
            if (($event['event'] ?? null) === 'existing_deposit_verification_started') {
                $generation = is_string($event['id'] ?? null) && $event['id'] !== '' ? $event['id'] : false;
                $result = null;
            } elseif (($event['event'] ?? null) === 'existing_deposit_verification') {
                if ($generation === null) {
                    // Older verification events predate generation identifiers.
                    $result = $event['verified'] ?? null;
                } elseif (is_string($generation) && ($event['id'] ?? null) === $generation) {
                    $result = $event['verified'] ?? null;
                }
            }
        }

        return $generation !== null ? $result !== true : $result === false;
    }
}
