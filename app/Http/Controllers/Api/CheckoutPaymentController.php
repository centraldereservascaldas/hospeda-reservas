<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCheckoutPaymentRequest;
use App\Models\DirectBookingOrder;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Http\JsonResponse;

class CheckoutPaymentController extends Controller
{
    public function store(StoreCheckoutPaymentRequest $request, string $publicReference, DirectCheckoutPaymentService $payments): JsonResponse
    {
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        $providedToken = (string) $request->header('X-Checkout-Resume-Token', '');
        if ($order === null || $providedToken === '' || ! hash_equals((string) $order->resume_token, $providedToken)) {
            return response()->json(['success' => false, 'code' => 'checkout_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        $result = $payments->createAttempt($order, $request);

        return response()->json([
            'success' => in_array($result['status'], [200, 201], true),
            'code' => $result['code'],
            'message' => $result['message'],
            'replayed' => $result['replayed'],
            'payment' => $result['attempt'] === null ? null : [
                'id' => $result['attempt']->id,
                'status' => $result['attempt']->status,
                'method' => $result['attempt']->payment_method,
                'amount' => $result['attempt']->amount,
                'currency' => $result['attempt']->currency,
                'expiresAt' => $result['attempt']->expires_at?->toISOString(),
                'paidAt' => $result['attempt']->paid_at?->toISOString(),
                'pix' => $result['attempt']->payment_method === 'pix' ? [
                    'copyPaste' => $result['attempt']->pix_copy_paste,
                    'qrCodeBase64' => $result['attempt']->pix_qr_code_base64,
                ] : null,
            ],
        ], $result['status'])->header('Cache-Control', 'no-store, private');
    }
}
