<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\AffiliateAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AffiliateDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $account = AffiliateAccount::query()->find($guest->id);
        if (! $account || $account->status !== 'approved') {
            return response()->json(['success' => false, 'code' => 'affiliate_not_approved'], 403);
        }

        $page = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']])['page'] ?? 1;
        $results = DB::table('affiliate_conversions as conversion')
            ->join('direct_booking_orders as booking', 'booking.id', '=', 'conversion.direct_booking_order_id')
            ->where('conversion.affiliate_user_id', $guest->id)
            ->orderByDesc('conversion.created_at')
            ->orderByDesc('conversion.id')
            ->simplePaginate(50, ['booking.listing_id', 'booking.check_in', 'booking.check_out', 'booking.status as booking_status',
                'booking.payment_status', 'conversion.status as commission_status', 'conversion.approved_amount_cents', 'conversion.created_at'], 'page', $page);
        $conversions = $results->getCollection()->map(function (object $row): array {
            $needsReview = $row->commission_status === 'approved'
                && (! in_array($row->booking_status, ['confirmado', 'concluido'], true) || $row->payment_status !== 'approved');

            return [
                'listing_id' => $row->listing_id,
                'check_in' => $row->check_in,
                'check_out' => $row->check_out,
                'booking_status' => $row->booking_status,
                'commission_status' => $needsReview ? 'review' : $row->commission_status,
                'approved_amount_cents' => $needsReview ? null : $row->approved_amount_cents,
                'created_at' => $row->created_at,
            ];
        });
        $clicks = DB::table('affiliate_clicks as click')
            ->join('affiliate_short_links as link', 'link.id', '=', 'click.affiliate_short_link_id')
            ->where('link.affiliate_user_id', $guest->id)
            ->count();

        return response()->json(['success' => true, 'clicks' => $clicks, 'conversions' => $conversions, 'hasMore' => $results->hasMorePages()])
            ->header('Cache-Control', 'private, no-store');
    }
}
