<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveAffiliateCommissionRequest;
use App\Http\Requests\ApproveAffiliateRequest;
use App\Http\Requests\MarkAffiliateCommissionPaidRequest;
use App\Models\AffiliateAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AffiliateAdminController extends Controller
{
    public function index(): JsonResponse
    {
        $accounts = AffiliateAccount::query()->where('status', 'pending')->orderBy('created_at')
            ->limit(100)->get(['user_id', 'full_name', 'status', 'created_at']);

        return response()->json(['success' => true, 'accounts' => $accounts]);
    }

    public function approvedAccounts(): JsonResponse
    {
        $accounts = AffiliateAccount::query()->where('status', 'approved')->orderBy('full_name')
            ->limit(100)->get(['user_id', 'full_name', 'status', 'commission_basis_points']);

        return response()->json(['success' => true, 'accounts' => $accounts])->header('Cache-Control', 'private, no-store');
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

    public function commissions(): JsonResponse
    {
        $items = DB::table('affiliate_conversions as conversion')
            ->join('affiliate_accounts as affiliate', 'affiliate.user_id', '=', 'conversion.affiliate_user_id')
            ->join('direct_booking_orders as booking', 'booking.id', '=', 'conversion.direct_booking_order_id')
            ->orderByDesc('conversion.created_at')->limit(100)
            ->get(['conversion.id', 'affiliate.full_name', 'booking.listing_id', 'booking.status as booking_status',
                'booking.payment_status', 'booking.quote_total', 'booking.currency', 'conversion.commission_basis_points',
                'conversion.status', 'conversion.approved_amount_cents', 'conversion.created_at']);

        return response()->json(['success' => true, 'commissions' => $items])->header('Cache-Control', 'private, no-store');
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
