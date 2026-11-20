<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\AffiliateAccount;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysSimulator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        if ($account?->status === 'approved' && is_string($account->referral_code)) {
            $response['referralCode'] = $account->referral_code;
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

    public function capture(Request $request): JsonResponse
    {
        $data = $request->validate([
            'referral' => ['required', 'string', 'size:40', 'regex:/^[A-Za-z0-9]+$/'],
            'listingId' => ['required', 'string', 'regex:/^[A-Za-z0-9_-]{1,100}$/'],
            'signature' => ['required', 'string', 'size:64', 'regex:/^[a-f0-9]+$/'],
            'issuedAt' => ['sometimes', 'integer', 'min:1'],
        ]);
        $key = config('app.key');
        $issuedAt = $data['issuedAt'] ?? null;
        $signedValue = $issuedAt === null ? $data['referral'].':'.$data['listingId'] : 'affiliate-click:'.$data['referral'].':'.$data['listingId'].':'.$issuedAt;
        if (! is_string($key) || $key === '' || ($issuedAt !== null && ($issuedAt > now()->timestamp || $issuedAt <= now()->subDays(30)->timestamp)) || ! hash_equals(hash_hmac('sha256', $signedValue, $key), $data['signature']) || ! AffiliateAccount::query()->where('referral_code', $data['referral'])->where('status', 'approved')->exists()) {
            return response()->json(['success' => false], 403)->header('Cache-Control', 'private, no-store');
        }
        $issuedAt ??= now()->timestamp;
        $signature = hash_hmac('sha256', 'affiliate-click:'.$data['referral'].':'.$data['listingId'].':'.$issuedAt, $key);

        return response()->json(['success' => true, 'issuedAt' => $issuedAt, 'signature' => $signature])->header('Cache-Control', 'private, no-store');
    }

    public function link(Request $request, string $listingId, StaysAccommodationCatalog $catalog, StaysSimulator $simulator): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $account = AffiliateAccount::query()->find($guest->id);
        if (! $account || $account->status !== 'approved' || ! is_string($account->referral_code)) {
            return response()->json(['success' => false, 'code' => 'affiliate_not_approved'], 403);
        }
        $listingData = $simulator->enabled() ? $simulator->catalog() : ($catalog->get()['data'] ?? null);
        if (! is_array($listingData)) {
            return response()->json(['success' => false, 'code' => 'catalog_unavailable'], 503);
        }
        $listing = collect($listingData)->first(fn ($item) => is_array($item) && ($item['id'] ?? null) === $listingId);
        if (! $listing) {
            return response()->json(['success' => false, 'code' => 'listing_not_available'], 404);
        }
        if (! is_string(config('app.key')) || config('app.key') === '') {
            return response()->json(['success' => false, 'code' => 'affiliate_signing_unavailable'], 503);
        }
        $signature = hash_hmac('sha256', $account->referral_code.':'.$listingId, (string) config('app.key'));

        return response()->json(['success' => true, 'referralCode' => $account->referral_code, 'signature' => $signature])
            ->header('Cache-Control', 'private, no-store');
    }
}
