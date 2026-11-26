<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class AffiliateCommissionAuditRecorder
{
    /** @param array<string, mixed> $evidence */
    public function record(
        int $conversionId,
        string $actorUserId,
        string $eventType,
        ?string $fromStatus,
        ?string $toStatus,
        array $evidence,
    ): void {
        DB::table('affiliate_commission_events')->insert([
            'affiliate_conversion_id' => $conversionId,
            'actor_user_id' => $actorUserId,
            'event_type' => $eventType,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'evidence' => json_encode($evidence, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
        ]);
    }
}
