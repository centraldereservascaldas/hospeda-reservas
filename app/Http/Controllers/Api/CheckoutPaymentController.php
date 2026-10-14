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
            return response()->json(['success' => false, 'code' => 'checkout_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }

        $result = $payments->createAttempt($order, $request);
        $order->refresh();
        $attempt = $result['attempt'];
        $pixInstructions = $attempt?->safePixInstructions($order->status->value === 'pagamento_pendente');

        return response()->json([
            'success' => in_array($result['status'], [200, 201], true),
            'code' => $result['code'],
            'message' => $result['message'],
            'replayed' => $result['replayed'],
            'payment' => $attempt === null ? null : [
                'id' => $attempt->id,
                'status' => $attempt->status,
                'method' => $attempt->payment_method,
                'amount' => $attempt->amount,
                'currency' => $attempt->currency,
                'expiresAt' => $attempt->expires_at?->toISOString(),
                'paidAt' => $attempt->paid_at?->toISOString(),
                'pix' => $attempt->payment_method === 'pix' ? [
                    'copyPaste' => $pixInstructions['copyPaste'],
                    'qrCodeBase64' => $pixInstructions['qrCodeBase64'],
                ] : null,
            ],
        ], $result['status'])->header('Cache-Control', 'no-store, private');
    }
}
