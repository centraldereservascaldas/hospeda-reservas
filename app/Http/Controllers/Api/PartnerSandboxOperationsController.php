<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerManualPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class PartnerSandboxOperationsController extends Controller
{
    public function index(): JsonResponse
    {
        abort_unless(app()->environment(['local', 'testing']) && config('services.partner_checkout_sandbox.enabled'), 404);
        $orders = PartnerCheckoutOrder::query()->whereIn('status', ['awaiting_seller_payment', 'attention_required', 'reservation_starting'])->orderBy('updated_at')->limit(100)->get(['id', 'supplier_property_id', 'check_in', 'check_out', 'guests', 'base_cents', 'payment_cents', 'status', 'reservation_reference', 'updated_at']);

        return response()->json(['success' => true, 'orders' => $orders])->header('Cache-Control', 'no-store');
    }

    public function record(Request $request, string $id, PartnerManualPaymentService $payments): JsonResponse
    {
        abort_unless(app()->environment(['local', 'testing']) && config('services.partner_checkout_sandbox.enabled'), 404);
        $guest = $request->attributes->get('verified_guest');
        abort_unless($guest instanceof VerifiedGuest, 401);
        $input = $request->validate(['amountCents' => ['required', 'integer', 'min:1'], 'reference' => ['required', 'string', 'max:100']]);
        try {
            $payments->record($id, $guest->email, (int) $input['amountCents'], $input['reference']);
        } catch (Throwable) {
            return response()->json(['success' => false, 'message' => 'Pedido precisa de conferência.'], 409);
        }

        return response()->json(['success' => true, 'status' => 'supplier_payment_recorded'])->header('Cache-Control', 'no-store');
    }
}
