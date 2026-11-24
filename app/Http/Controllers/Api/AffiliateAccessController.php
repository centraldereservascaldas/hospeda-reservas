<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\AffiliateAccount;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysSimulator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AffiliateAccessController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        $account = AffiliateAccount::query()->find($guest->id);

        $response = ['success' => true, 'status' => $account?->status ?? 'none'];
        if (is_string($account?->nickname)) {
            $response['nickname'] = $account->nickname;
        }
        if ($account?->status === 'approved') {
            $response['commissionBasisPoints'] = $account->commission_basis_points;
        }

        return response()->json($response)->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        $account = AffiliateAccount::query()->firstOrCreate(
            ['user_id' => $guest->id],
            ['full_name' => $guest->fullName, 'status' => 'pending'],
        );

        if (in_array($account->status, ['suspended', 'rejected'], true)) {
            return response()->json(['success' => false, 'code' => 'affiliate_access_unavailable'], 403);
        }

        return response()->json(['success' => true, 'status' => $account->status]);
    }

    public function catalog(Request $request, StaysAccommodationCatalog $catalog, StaysSimulator $simulator): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest || ! AffiliateAccount::query()->whereKey($guest->id)->where('status', 'approved')->exists()) {
            return response()->json(['success' => false, 'code' => 'affiliate_not_approved'], 403);
        }
        $items = $simulator->enabled() ? $simulator->catalog() : ($catalog->get()['data'] ?? null);
        if (! is_array($items)) {
            return response()->json(['success' => false, 'code' => 'catalog_unavailable'], 503);
        }
        $excluded = DB::table('affiliate_listing_exclusions')->pluck('listing_id')->all();
        $items = collect($items)->filter(fn ($item) => is_array($item) && is_string($item['id'] ?? null) && ! in_array($item['id'], $excluded, true))->values();

        return response()->json(['success' => true, 'data' => $items])->header('Cache-Control', 'private, no-store');
    }

    public function link(Request $request, string $listingId, StaysAccommodationCatalog $catalog, StaysSimulator $simulator): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $account = AffiliateAccount::query()->find($guest->id);
        if (! $account || $account->status !== 'approved') {
            return response()->json(['success' => false, 'code' => 'affiliate_not_approved'], 403);
        }
        if (DB::table('affiliate_listing_exclusions')->where('listing_id', $listingId)->exists()) {
            return response()->json(['success' => false, 'code' => 'listing_not_available'], 404);
        }
        $listingData = $simulator->enabled() ? $simulator->catalog() : ($catalog->get()['data'] ?? null);
        if (! is_array($listingData)) {
            return response()->json(['success' => false, 'code' => 'catalog_unavailable'], 503);
        }
        $listing = collect($listingData)->first(fn ($item) => is_array($item) && ($item['id'] ?? null) === $listingId);
        if (! $listing) {
            return response()->json(['success' => false, 'code' => 'listing_not_available'], 404);
        }
        $link = DB::table('affiliate_short_links')
            ->where('affiliate_user_id', $account->user_id)
            ->where('listing_id', $listingId)
            ->where('status', 'active')
            ->first();

        if (! $link) {
            for ($attempt = 0; $attempt < 3 && $link === null; $attempt++) {
                try {
                    DB::table('affiliate_short_links')->insert([
                        'id' => (string) Str::uuid(),
                        'affiliate_user_id' => $account->user_id,
                        'token' => Str::random(24),
                        'listing_id' => $listingId,
                        'status' => 'active',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } catch (UniqueConstraintViolationException) {
                    // Another request may have created this link, or a token may have collided.
                }

                $link = DB::table('affiliate_short_links')
                    ->where('affiliate_user_id', $account->user_id)
                    ->where('listing_id', $listingId)
                    ->where('status', 'active')
                    ->first();
            }
        }

        if ($link === null) {
            return response()->json(['success' => false, 'code' => 'short_link_unavailable'], 503);
        }

        return response()->json([
            'success' => true,
            'nickname' => $account->nickname,
            'shortUrl' => url('/a/'.$link->token),
        ])->header('Cache-Control', 'private, no-store');
    }
}
