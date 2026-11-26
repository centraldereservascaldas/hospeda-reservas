<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerManualPaymentService;
use App\Services\PartnerManualReservationReview;
use App\Services\ImobSysPreReservationClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class PartnerSandboxOperationsController extends Controller
{
    public function review(Request $request, string $id, PartnerManualReservationReview $review): JsonResponse
    {
        abort_unless(app()->environment(['local', 'testing']) && config('services.partner_checkout_sandbox.enabled'), 404);
        $guest = $request->attributes->get('verified_guest');
        abort_unless($guest instanceof VerifiedGuest, 401);
        $input = $request->validate(['reference' => ['required', 'string', 'regex:/\A[1-9]\d{0,11}\z/D'], 'propertyId' => ['required', 'string', 'max:80'], 'from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d'], 'guests' => ['required', 'integer', 'min:1'], 'baseCents' => ['required', 'integer', 'min:1'], 'confirmed' => ['required', 'boolean']]);
        $input['guests'] = (int) $input['guests'];
        $input['baseCents'] = (int) $input['baseCents'];
        $input['confirmed'] = $input['confirmed'] === true;
        try {
            $review->confirm($id, $guest->email, $input);
        } catch (Throwable) {
            return response()->json(['success' => false, 'message' => 'Não foi possível confirmar. Confira os dados na ImobSys.'], 409)->header('Cache-Control', 'no-store, private');
        }
        return response()->json(['success' => true, 'status' => 'awaiting_seller_payment'])->header('Cache-Control', 'no-store, private');
    }

    public function supplierStatus(string $id, ImobSysPreReservationClient $supplier): JsonResponse
    {
        abort_unless(app()->environment(['local', 'testing']) && config('services.partner_checkout_sandbox.enabled'), 404);
        $order = PartnerCheckoutOrder::query()->findOrFail($id);
        if ($order->status !== 'attention_required' || $order->attention_reason !== 'supplier_outcome_unknown') {
            return response()->json(['success' => false], 409)->header('Cache-Control', 'no-store, private');
        }
        try {
            $result = $order->supplier_operation_id ? $supplier->lookup($order->supplier_operation_id) : $supplier->lookupByKey($order->reservation_idempotency_key);
            if (($result['propertyId'] ?? null) !== $order->supplier_property_id || ($result['from'] ?? null) !== $order->check_in->format('Y-m-d') || ($result['to'] ?? null) !== $order->check_out->format('Y-m-d') || ($result['guests'] ?? null) !== (int) $order->guests) {
                throw new \RuntimeException('Dados da operação divergentes.');
            }
            if (isset($result['amountCents']) && $result['amountCents'] !== (int) $order->base_cents) {
                throw new \RuntimeException('Valor da operação divergente.');
            }
            $partnerStatus = $result['partnerStatus'] ?? 'unknown';
            $reference = $result['reservationReference'] ?? null;
            if (! in_array($partnerStatus, ['unknown', 'confirmed', 'cancelled'], true) || ($reference !== null && (! is_string($reference) || ! preg_match('/\A[1-9]\d{0,11}\z/D', $reference)))) {
                throw new \RuntimeException('Resposta da operação inválida.');
            }
            return response()->json(['success' => true, 'state' => $result['state'], 'partnerStatus' => $partnerStatus, 'reservationReference' => $reference])->header('Cache-Control', 'no-store, private');
        } catch (Throwable) {
            return response()->json(['success' => false, 'message' => 'Não foi possível consultar. Mantenha a conferência manual.'], 503)->header('Cache-Control', 'no-store, private');
        }
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless(app()->environment(['local', 'testing']) && config('services.partner_checkout_sandbox.enabled'), 404);
        $input = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:10000']]);
        $page = (int) ($input['page'] ?? 1);
        $orders = PartnerCheckoutOrder::query()->whereIn('status', ['awaiting_seller_payment', 'attention_required', 'reservation_starting'])
            ->orderByRaw("CASE WHEN status IN ('attention_required', 'reservation_starting') THEN 0 ELSE 1 END")
            ->orderBy('updated_at')->orderBy('id')->simplePaginate(50, ['id', 'supplier_property_id', 'check_in', 'check_out', 'guests', 'base_cents', 'payment_cents', 'supplier_payable_observed_cents', 'status', 'attention_reason', 'reservation_reference', 'supplier_operation_id', 'updated_at'], 'page', $page);

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
