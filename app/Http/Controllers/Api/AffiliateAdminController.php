<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveAffiliateCommissionRequest;
use App\Http\Requests\ApproveAffiliateRequest;
use App\Http\Requests\MarkAffiliateCommissionPaidRequest;
use App\Models\AffiliateAccount;
use App\Services\StaysAccommodationCatalog;
use App\Services\StaysSimulator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AffiliateAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $page = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']])['page'] ?? 1;
        $accounts = AffiliateAccount::query()->where('status', 'pending')->orderBy('created_at')->orderBy('user_id')
            ->simplePaginate(50, ['user_id', 'full_name', 'status', 'created_at'], 'page', $page);

        return response()->json(['success' => true, 'accounts' => $accounts->items(), 'hasMore' => $accounts->hasMorePages()])->header('Cache-Control', 'private, no-store');
    }

    public function approvedAccounts(Request $request): JsonResponse
    {
        $page = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']])['page'] ?? 1;
        $accounts = AffiliateAccount::query()->whereIn('status', ['approved', 'suspended', 'rejected'])->orderBy('full_name')->orderBy('user_id')
            ->simplePaginate(50, ['user_id', 'full_name', 'nickname', 'status', 'commission_basis_points'], 'page', $page);

        return response()->json(['success' => true, 'accounts' => $accounts->items(), 'hasMore' => $accounts->hasMorePages()])->header('Cache-Control', 'private, no-store');
    }

    public function changeStatus(Request $request, string $userId): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:reject,suspend,reactivate,reconsider']]);
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $transitions = ['reject' => ['pending', 'rejected'], 'suspend' => ['approved', 'suspended'], 'reactivate' => ['suspended', 'approved'], 'reconsider' => ['rejected', 'pending']];
        [$from, $to] = $transitions[$data['action']];
        $updated = AffiliateAccount::query()->whereKey($userId)->where('status', $from)->update(['status' => $to, 'reviewed_by' => $reviewer->id, 'reviewed_at' => now(), 'updated_at' => now()]);

        return $updated === 1 ? response()->json(['success' => true, 'status' => $to]) : response()->json(['success' => false, 'code' => 'invalid_affiliate_transition'], 409);
    }

    public function listings(StaysAccommodationCatalog $catalog, StaysSimulator $simulator): JsonResponse
    {
        $items = $simulator->enabled() ? $simulator->catalog() : ($catalog->get()['data'] ?? null);
        if (! is_array($items)) {
            return response()->json(['success' => false, 'code' => 'catalog_unavailable'], 503);
        }
        $excluded = DB::table('affiliate_listing_exclusions')->pluck('listing_id')->all();
        $listings = collect($items)->filter(fn ($item) => is_array($item) && is_string($item['id'] ?? null))->map(fn ($item) => ['id' => $item['id'], 'title' => $item['title'] ?? $item['name'] ?? $item['id'], 'enabled' => ! in_array($item['id'], $excluded, true)])->values();

        return response()->json(['success' => true, 'listings' => $listings])->header('Cache-Control', 'private, no-store');
    }

    public function updateListing(Request $request, string $listingId): JsonResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        if ($data['enabled']) {
            DB::table('affiliate_listing_exclusions')->where('listing_id', $listingId)->delete();
        } else {
            DB::table('affiliate_listing_exclusions')->updateOrInsert(['listing_id' => $listingId], ['updated_by' => $reviewer->id, 'updated_at' => now(), 'created_at' => now()]);
        }

        return response()->json(['success' => true]);
    }

    public function updateRate(ApproveAffiliateRequest $request, string $userId): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $updated = AffiliateAccount::query()->whereKey($userId)->where('status', 'approved')->update([
            'commission_basis_points' => $request->validated('commissionBasisPoints'),
            'reviewed_by' => $reviewer->id, 'reviewed_at' => now(), 'updated_at' => now(),
        ]);

        return $updated === 1 ? response()->json(['success' => true])
            : response()->json(['success' => false, 'code' => 'affiliate_not_approved'], 409);
    }

    public function approve(ApproveAffiliateRequest $request, string $userId): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        $approved = DB::transaction(function () use ($userId, $request, $reviewer): bool {
            $account = AffiliateAccount::query()->whereKey($userId)->lockForUpdate()->first();
            if (! $account || $account->status !== 'pending') {
                return false;
            }
            $account->status = 'approved';
            $account->referral_code = Str::random(40);
            $account->nickname = $this->uniqueNickname($account->full_name);
            $account->commission_basis_points = $request->validated('commissionBasisPoints');
            $account->reviewed_at = now();
            $account->reviewed_by = $reviewer->id;
            $account->save();

            return true;
        });

        return $approved
            ? response()->json(['success' => true, 'status' => 'approved'])
            : response()->json(['success' => false, 'code' => 'affiliate_not_pending'], 409);
    }

    private function uniqueNickname(string $fullName): string
    {
        $base = Str::slug($fullName);
        $base = $base !== '' ? Str::limit($base, 40, '') : 'parceiro';

        do {
            $nickname = $base.'-'.Str::lower(Str::random(5));
        } while (AffiliateAccount::query()->where('nickname', $nickname)->exists());

        return $nickname;
    }

    public function commissions(Request $request): JsonResponse
    {
        $page = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']])['page'] ?? 1;
        $items = DB::table('affiliate_conversions as conversion')
            ->join('affiliate_accounts as affiliate', 'affiliate.user_id', '=', 'conversion.affiliate_user_id')
            ->join('direct_booking_orders as booking', 'booking.id', '=', 'conversion.direct_booking_order_id')
            ->leftJoin('affiliate_short_links as link', 'link.id', '=', 'conversion.affiliate_short_link_id')
            ->orderByDesc('conversion.created_at')->orderByDesc('conversion.id')
            ->simplePaginate(50, ['conversion.id', 'affiliate.full_name', 'affiliate.nickname', 'booking.listing_id',
                'link.token as short_link_token', 'conversion.attributed_at', 'conversion.last_clicked_at', 'booking.status as booking_status',
                'booking.payment_status', 'booking.quote_total', 'booking.currency', 'conversion.commission_basis_points',
                'conversion.status', 'conversion.approved_amount_cents', 'conversion.created_at'], 'page', $page);

        return response()->json(['success' => true, 'commissions' => $items->items(), 'hasMore' => $items->hasMorePages()])->header('Cache-Control', 'private, no-store');
    }

    public function approveCommission(ApproveAffiliateCommissionRequest $request, int $id): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $approved = DB::transaction(function () use ($request, $reviewer, $id): bool {
            $conversion = DB::table('affiliate_conversions')->where('id', $id)->lockForUpdate()->first();
            if (! $conversion || $conversion->status !== 'pending') {
                return false;
            }
            $booking = DB::table('direct_booking_orders')->where('id', $conversion->direct_booking_order_id)->lockForUpdate()->first();
            if (! $booking || ! in_array($booking->status, ['confirmado', 'concluido'], true) || $booking->payment_status !== 'approved') {
                return false;
            }
            DB::table('affiliate_conversions')->where('id', $id)->update([
                'status' => 'approved', 'approved_amount_cents' => $request->validated('amountCents'),
                'reviewed_at' => now(), 'reviewed_by' => $reviewer->id, 'updated_at' => now(),
            ]);

            return true;
        });

        return $approved ? response()->json(['success' => true, 'status' => 'approved'])
            : response()->json(['success' => false, 'code' => 'commission_not_eligible'], 409);
    }

    public function markCommissionPaid(MarkAffiliateCommissionPaidRequest $request, int $id): JsonResponse
    {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $marked = DB::transaction(function () use ($request, $reviewer, $id): bool {
            $conversion = DB::table('affiliate_conversions')->where('id', $id)->lockForUpdate()->first();
            if (! $conversion || $conversion->status !== 'approved' || ! $conversion->approved_amount_cents) {
                return false;
            }
            $booking = DB::table('direct_booking_orders')->where('id', $conversion->direct_booking_order_id)->lockForUpdate()->first();
            if (! $booking || ! in_array($booking->status, ['confirmado', 'concluido'], true) || $booking->payment_status !== 'approved') {
                return false;
            }
            DB::table('affiliate_conversions')->where('id', $id)->update([
                'status' => 'paid', 'paid_at' => now(), 'paid_by' => $reviewer->id,
                'payment_reference' => $request->validated('paymentReference'), 'updated_at' => now(),
            ]);

            return true;
        });

        return $marked ? response()->json(['success' => true, 'status' => 'paid'])
            : response()->json(['success' => false, 'code' => 'commission_not_payable'], 409);
    }
}
