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
    public function index(Request $request): JsonResponse
    {
        abort_unless(app()->environment(['local', 'testing']) && config('services.partner_checkout_sandbox.enabled'), 404);
        $input = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:10000']]);
        $page = (int) ($input['page'] ?? 1);
        $orders = PartnerCheckoutOrder::query()->whereIn('status', ['awaiting_seller_payment', 'attention_required', 'reservation_starting'])
            ->orderByRaw("CASE WHEN status IN ('attention_required', 'reservation_starting') THEN 0 ELSE 1 END")
            ->orderBy('updated_at')->orderBy('id')->simplePaginate(50, ['id', 'supplier_property_id', 'check_in', 'check_out', 'guests', 'base_cents', 'payment_cents', 'status', 'attention_reason', 'reservation_reference', 'updated_at'], 'page', $page);

        return response()->json(['success' => true, 'orders' => $orders->items(), 'nextPage' => $orders->hasMorePages() ? $page + 1 : null])->header('Cache-Control', 'no-store');
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
