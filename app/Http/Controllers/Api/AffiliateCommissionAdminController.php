<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Enums\AffiliateCommissionStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveAffiliateCommissionRequest;
use App\Http\Requests\MarkAffiliateCommissionPaidRequest;
use App\Services\AffiliateCommissionAuditRecorder;
use App\Services\AffiliateCommissionCalculator;
use App\Services\AffiliateCommissionEligibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AffiliateCommissionAdminController extends Controller
{
    public function index(Request $request, AffiliateCommissionCalculator $calculator): JsonResponse
    {
        $page = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']])['page'] ?? 1;
        $items = DB::table('affiliate_conversions as conversion')
            ->join('affiliate_accounts as affiliate', 'affiliate.user_id', '=', 'conversion.affiliate_user_id')
            ->join('direct_booking_orders as booking', 'booking.id', '=', 'conversion.direct_booking_order_id')
            ->leftJoin('affiliate_short_links as link', 'link.id', '=', 'conversion.affiliate_short_link_id')
            ->orderByDesc('conversion.created_at')->orderByDesc('conversion.id')
            ->simplePaginate(50, ['conversion.id', 'affiliate.full_name', 'affiliate.nickname', 'booking.listing_id',
                'link.token as short_link_token', 'conversion.attributed_at', 'conversion.last_clicked_at', 'booking.status as booking_status',
                'booking.check_in', 'booking.check_out', 'booking.reservation_status', 'booking.payment_status', 'booking.quote_total',
                'booking.currency', 'conversion.commission_basis_points', 'conversion.status', 'conversion.approved_amount_cents',
                'conversion.created_at'], 'page', $page);
        $items->getCollection()->transform(function (object $item) use ($calculator): object {
            $item->calculated_amount_cents = $calculator->calculateCents(
                (string) $item->quote_total,
                (string) $item->currency,
                $item->commission_basis_points === null ? null : (int) $item->commission_basis_points,
            );

            return $item;
        });

        return response()->json(['success' => true, 'commissions' => $items->items(), 'hasMore' => $items->hasMorePages()])
            ->header('Cache-Control', 'private, no-store');
    }

    public function events(Request $request, int $id): JsonResponse
    {
        if (! DB::table('affiliate_conversions')->where('id', $id)->exists()) {
            return response()->json(['success' => false, 'code' => 'commission_not_found'], 404);
        }

        $page = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']])['page'] ?? 1;
        $results = DB::table('affiliate_commission_events')->where('affiliate_conversion_id', $id)
            ->orderBy('created_at')->orderBy('id')->simplePaginate(100, ['*'], 'page', $page);
        $events = $results->getCollection()->map(fn (object $event): array => [
            'id' => $event->id,
            'actorUserId' => $event->actor_user_id,
            'type' => $event->event_type,
            'fromStatus' => $event->from_status,
            'toStatus' => $event->to_status,
            'evidence' => json_decode($event->evidence, true),
            'createdAt' => $event->created_at,
        ]);

        return response()->json(['success' => true, 'events' => $events, 'hasMore' => $results->hasMorePages()])
            ->header('Cache-Control', 'private, no-store');
    }

    public function approve(
        ApproveAffiliateCommissionRequest $request,
        int $id,
        AffiliateCommissionEligibility $eligibility,
        AffiliateCommissionCalculator $calculator,
        AffiliateCommissionAuditRecorder $audit,
    ): JsonResponse {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        $approved = DB::transaction(function () use ($request, $reviewer, $id, $eligibility, $calculator, $audit): bool {
            $conversion = DB::table('affiliate_conversions')->where('id', $id)->lockForUpdate()->first();
            if (! $conversion) {
                return false;
            }
            $booking = DB::table('direct_booking_orders')->where('id', $conversion->direct_booking_order_id)->lockForUpdate()->first();
            $decision = $eligibility->evaluate($booking);
            $amountCents = $booking === null ? null : $calculator->calculateCents(
                (string) $booking->quote_total,
                (string) $booking->currency,
                $conversion->commission_basis_points === null ? null : (int) $conversion->commission_basis_points,
            );
            $eligible = $conversion->status === AffiliateCommissionStatus::Pending->value
                && $decision['eligible'] && $amountCents !== null;
            $audit->record($id, $reviewer->id, $eligible ? 'approved' : 'approval_blocked', $conversion->status,
                $eligible ? AffiliateCommissionStatus::Approved->value : $conversion->status, [
                    'reasons' => $eligible ? [] : [...$decision['reasons'], ...($amountCents === null ? ['commission_amount_unavailable'] : []), ...($conversion->status === AffiliateCommissionStatus::Pending->value ? [] : ['commission_not_pending'])],
                    'conversion' => [
                        'affiliate_user_id' => $conversion->affiliate_user_id,
                        'booking_order_id' => $conversion->direct_booking_order_id,
                        'commission_basis_points' => $conversion->commission_basis_points,
                    ],
                    'booking' => $decision['evidence'],
                    'calculated_amount_cents' => $eligible ? $amountCents : null,
                    'commission_basis_points' => $conversion->commission_basis_points ?? AffiliateCommissionCalculator::DEFAULT_BASIS_POINTS,
                    'calculation_version' => AffiliateCommissionCalculator::VERSION,
                    'reason' => $request->validated('reason'),
                ]);

            if (! $eligible) {
                return false;
            }

            DB::table('affiliate_conversions')->where('id', $id)->update([
                'status' => AffiliateCommissionStatus::Approved->value,
                'approved_amount_cents' => $amountCents,
                'reviewed_at' => now(),
                'reviewed_by' => $reviewer->id,
                'updated_at' => now(),
            ]);

            return true;
        });

        return $approved ? response()->json(['success' => true, 'status' => AffiliateCommissionStatus::Approved->value])
            : response()->json(['success' => false, 'code' => 'commission_not_eligible'], 409);
    }

    public function markPaid(
        MarkAffiliateCommissionPaidRequest $request,
        int $id,
        AffiliateCommissionEligibility $eligibility,
        AffiliateCommissionAuditRecorder $audit,
    ): JsonResponse {
        $reviewer = $request->attributes->get('verified_guest');
        if (! $reviewer instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        $marked = DB::transaction(function () use ($request, $reviewer, $id, $eligibility, $audit): bool {
            $conversion = DB::table('affiliate_conversions')->where('id', $id)->lockForUpdate()->first();
            if (! $conversion) {
                return false;
            }
            $booking = DB::table('direct_booking_orders')->where('id', $conversion->direct_booking_order_id)->lockForUpdate()->first();
            $decision = $eligibility->evaluate($booking);
            $eligible = $conversion->status === AffiliateCommissionStatus::Approved->value
                && (int) $conversion->approved_amount_cents > 0 && $decision['eligible'];
            $audit->record($id, $reviewer->id, $eligible ? 'paid' : 'payment_blocked', $conversion->status,
                $eligible ? AffiliateCommissionStatus::Paid->value : $conversion->status, [
                    'reasons' => $eligible ? [] : [...$decision['reasons'], ...($conversion->status !== AffiliateCommissionStatus::Approved->value ? ['commission_not_approved'] : []),
                        ...((int) $conversion->approved_amount_cents > 0 ? [] : ['commission_amount_missing'])],
                    'conversion' => [
                        'affiliate_user_id' => $conversion->affiliate_user_id,
                        'booking_order_id' => $conversion->direct_booking_order_id,
                        'approved_amount_cents' => $conversion->approved_amount_cents,
                    ],
                    'booking' => $decision['evidence'],
                    'payment_reference' => $request->validated('paymentReference'),
                ]);

            if (! $eligible) {
                return false;
            }

            DB::table('affiliate_conversions')->where('id', $id)->update([
                'status' => AffiliateCommissionStatus::Paid->value,
                'paid_at' => now(),
                'paid_by' => $reviewer->id,
                'payment_reference' => $request->validated('paymentReference'),
                'updated_at' => now(),
            ]);

            return true;
        });

        return $marked ? response()->json(['success' => true, 'status' => AffiliateCommissionStatus::Paid->value])
            : response()->json(['success' => false, 'code' => 'commission_not_payable'], 409);
    }
}
