<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Enums\AffiliateCommissionStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\AffiliateDashboardRequest;
use App\Models\AffiliateAccount;
use App\Services\AffiliateCommissionEligibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AffiliateDashboardController extends Controller
{
    public function index(AffiliateDashboardRequest $request, AffiliateCommissionEligibility $eligibility): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $account = AffiliateAccount::query()->find($guest->id);
        if (! $account || $account->status !== 'approved') {
            return response()->json(['success' => false, 'code' => 'affiliate_not_approved'], 403);
        }

        $filters = $request->validated();
        $page = $filters['page'] ?? 1;
        $query = DB::table('affiliate_conversions as conversion')
            ->join('direct_booking_orders as booking', 'booking.id', '=', 'conversion.direct_booking_order_id')
            ->where('conversion.affiliate_user_id', $guest->id);

        if (isset($filters['listingId'])) {
            $query->where('booking.listing_id', $filters['listingId']);
        }

        if (isset($filters['from'])) {
            $query->whereDate('booking.check_in', '>=', $filters['from']);
        }

        if (isset($filters['to'])) {
            $query->whereDate('booking.check_in', '<=', $filters['to']);
        }

        if (($filters['commissionStatus'] ?? null) === 'review') {
            $query->whereIn('conversion.status', [AffiliateCommissionStatus::Approved->value, AffiliateCommissionStatus::Paid->value])
                ->where(function ($evidenceQuery): void {
                    $evidenceQuery->where('booking.status', '!=', 'concluido')
                        ->orWhereNull('booking.status')
                        ->orWhereNull('booking.check_out')
                        ->orWhereDate('booking.check_out', '>=', now()->toDateString())
                        ->orWhere('booking.payment_status', '!=', 'approved')
                        ->orWhereNull('booking.payment_status')
                        ->orWhere('booking.reservation_status', '!=', 'booked')
                        ->orWhereNull('booking.reservation_status');
                });
        } elseif (isset($filters['commissionStatus'])) {
            $query->where('conversion.status', $filters['commissionStatus']);
            if (in_array($filters['commissionStatus'], [AffiliateCommissionStatus::Approved->value, AffiliateCommissionStatus::Paid->value], true)) {
                $query->where('booking.status', 'concluido')
                    ->whereNotNull('booking.check_out')
                    ->whereDate('booking.check_out', '<', now()->toDateString())
                    ->where('booking.payment_status', 'approved')
                    ->where('booking.reservation_status', 'booked');
            }
        }

        $results = $query->orderByDesc('conversion.created_at')
            ->orderByDesc('conversion.id')
            ->simplePaginate(50, ['booking.listing_id', 'booking.check_in', 'booking.check_out', 'booking.status as booking_status',
                'booking.reservation_status', 'booking.payment_status', 'booking.currency', 'booking.quote_total',
                'conversion.status as commission_status', 'conversion.approved_amount_cents', 'conversion.created_at'], 'page', $page);
        $conversions = $results->getCollection()->map(function (object $row) use ($eligibility): array {
            $bookingEvidence = (object) [
                'status' => $row->booking_status,
                'reservation_status' => $row->reservation_status,
                'check_in' => $row->check_in,
                'check_out' => $row->check_out,
                'payment_status' => $row->payment_status,
                'currency' => $row->currency,
                'quote_total' => $row->quote_total,
            ];
            $needsReview = in_array($row->commission_status, [AffiliateCommissionStatus::Approved->value, AffiliateCommissionStatus::Paid->value], true)
                && ! $eligibility->evaluate($bookingEvidence)['eligible'];

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
