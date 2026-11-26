<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AffiliateAttributionService
{
    public const COOKIE_NAME = 'affiliate_attribution';

    public const WINDOW_DAYS = 7;

    /** @return array{listingId: string, attributionId: string}|null */
    public function recordClick(Request $request, string $token): ?array
    {
        return DB::transaction(function () use ($request, $token): ?array {
            $link = DB::table('affiliate_short_links as link')
                ->join('affiliate_accounts as affiliate', 'affiliate.user_id', '=', 'link.affiliate_user_id')
                ->where('link.token', $token)
                ->where('link.status', 'active')
                ->where('affiliate.status', 'approved')
                ->select('link.id', 'link.affiliate_user_id', 'link.listing_id')
                ->lockForUpdate()
                ->first();

            if (! $link || DB::table('affiliate_listing_exclusions')->where('listing_id', $link->listing_id)->exists()) {
                return null;
            }

            $clickedAt = now();
            $expiresAt = $clickedAt->copy()->addDays(self::WINDOW_DAYS);
            $cookieValue = $request->cookie(self::COOKIE_NAME);
            $attribution = is_string($cookieValue) && Str::isUuid($cookieValue)
                ? DB::table('affiliate_attributions')->where('id', $cookieValue)->lockForUpdate()->first()
                : null;

            if ($attribution && Carbon::parse($attribution->expires_at)->isAfter($clickedAt)) {
                DB::table('affiliate_attributions')->where('id', $attribution->id)->update([
                    'affiliate_user_id' => $link->affiliate_user_id,
                    'affiliate_short_link_id' => $link->id,
                    'listing_id' => $link->listing_id,
                    'last_clicked_at' => $clickedAt,
                    'expires_at' => $expiresAt,
                    'updated_at' => $clickedAt,
                ]);
                $attributionId = $attribution->id;
            } else {
                $attributionId = (string) Str::uuid();
                DB::table('affiliate_attributions')->insert([
                    'id' => $attributionId,
                    'affiliate_user_id' => $link->affiliate_user_id,
                    'affiliate_short_link_id' => $link->id,
                    'listing_id' => $link->listing_id,
                    'first_clicked_at' => $clickedAt,
                    'last_clicked_at' => $clickedAt,
                    'expires_at' => $expiresAt,
                    'created_at' => $clickedAt,
                    'updated_at' => $clickedAt,
                ]);
            }

            DB::table('affiliate_clicks')->insert([
                'affiliate_short_link_id' => $link->id,
                'affiliate_attribution_id' => $attributionId,
                'clicked_at' => $clickedAt,
                'created_at' => $clickedAt,
                'updated_at' => $clickedAt,
            ]);

            return ['listingId' => $link->listing_id, 'attributionId' => $attributionId];
        });
    }

    /** @param array<int, string> $acceptedListingIds */
    public function recordConversion(?string $attributionId, array $acceptedListingIds, string $orderId): bool
    {
        if (! is_string($attributionId) || ! Str::isUuid($attributionId)) {
            return false;
        }

        $attribution = DB::table('affiliate_attributions')->where('id', $attributionId)->lockForUpdate()->first();
        if (! $attribution || ! Carbon::parse($attribution->expires_at)->isFuture()
            || ! in_array($attribution->listing_id, $acceptedListingIds, true)
            || ! DB::table('affiliate_accounts')->where('user_id', $attribution->affiliate_user_id)->where('status', 'approved')->exists()
            || ! DB::table('affiliate_short_links')->where('id', $attribution->affiliate_short_link_id)->where('status', 'active')->exists()
            || DB::table('affiliate_listing_exclusions')->where('listing_id', $attribution->listing_id)->exists()) {
            return false;
        }

        if (DB::table('affiliate_conversions')->where('direct_booking_order_id', $orderId)->exists()) {
            return true;
        }

        DB::table('affiliate_conversions')->insert([
            'affiliate_user_id' => $attribution->affiliate_user_id,
            'direct_booking_order_id' => $orderId,
            'affiliate_short_link_id' => $attribution->affiliate_short_link_id,
            'affiliate_attribution_id' => $attribution->id,
            'listing_id' => $attribution->listing_id,
            'attributed_at' => now(),
            'last_clicked_at' => $attribution->last_clicked_at,
            'commission_basis_points' => DB::table('affiliate_accounts')->where('user_id', $attribution->affiliate_user_id)->value('commission_basis_points'),
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return true;
    }
}
