<?php

namespace App\Http\Controllers\Api;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Controllers\Controller;
use App\Models\DirectBookingOrder;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class CieloSopController extends Controller
{
    public function accessToken(
        Request $request,
        string $publicReference,
        DirectCheckoutPaymentService $payments,
    ): JsonResponse {
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        $providedToken = (string) $request->header('X-Checkout-Resume-Token', '');

        if ($order === null || ! $order->hasValidResumeToken($providedToken)) {
            return response()->json(['success' => false, 'code' => 'checkout_not_found'], 404)
                ->header('Cache-Control', 'no-store, private');
        }

        if (! config('direct-booking.enabled', false)
            || ! config('direct-booking.payments_enabled', false)
            || ! config('direct-booking.confirmation_enabled', false)) {
            return response()->json(['success' => false, 'code' => 'payments_disabled'], 503)
                ->header('Cache-Control', 'no-store, private');
        }

        if (! in_array($order->status, [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::PagamentoRecusado], true)
            || $order->expires_at === null
            || $order->expires_at->isPast()
            || $order->gateway_provider !== 'cielo_sandbox'
            || ! in_array('card', $payments->availableMethods($order), true)) {
            return response()->json(['success' => false, 'code' => 'checkout_not_payable'], 409)
                ->header('Cache-Control', 'no-store, private');
        }

        try {
            return response()->json([
                'success' => true,
                'environment' => 'sandbox',
                'accessToken' => $payments->cieloSopAccessToken($order),
            ])
                ->header('Cache-Control', 'no-store, private');
        } catch (Throwable) {
            return response()->json(['success' => false, 'code' => 'cielo_sop_unavailable'], 503)
                ->header('Cache-Control', 'no-store, private');
        }
    }
}
