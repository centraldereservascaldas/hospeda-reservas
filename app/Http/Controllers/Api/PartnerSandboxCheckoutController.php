<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\CompletePartnerCheckout;
use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerCheckoutOrderFactory;
use App\Services\PartnerPaymentStartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class PartnerSandboxCheckoutController extends Controller
{
    private function available(): bool
    {
        return app()->environment(['local', 'testing']) && config('services.cielo.direct_environment') === 'sandbox' && (bool) config('services.partner_checkout_sandbox.enabled');
    }

    public function store(Request $request, PartnerCheckoutOrderFactory $factory): JsonResponse
    {
        abort_unless($this->available(), 404);
        $input = $request->validate(['propertyId' => ['required', 'string', 'max:100'], 'from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d', 'after:from'], 'guests' => ['required', 'integer', 'min:2', 'max:10'], 'method' => ['required', 'in:pix,card'], 'installments' => ['nullable', 'integer', 'min:1', 'max:6'], 'acceptedBaseCents' => ['required', 'integer', 'min:1'], 'customer.fullName' => ['required', 'string', 'max:150'], 'customer.cpf' => ['required', 'digits:11'], 'customer.phone' => ['required', 'digits_between:10,13']]);
        try {
            $order = $factory->create($input);
        } catch (Throwable) {
            return response()->json(['success' => false, 'message' => 'Não foi possível confirmar a cotação.'], 409);
        }

        return response()->json(['success' => true, 'reference' => $order->public_reference, 'baseCents' => (int) $order->base_cents, 'paymentCents' => (int) $order->payment_cents, 'status' => $order->status], 201);
    }

    public function payment(Request $request, string $reference, PartnerPaymentStartService $payments): JsonResponse
    {
        abort_unless($this->available(), 404);
        abort_unless((bool) preg_match('/\A[A-Za-z0-9]{40}\z/D', $reference), 404);
        $input = $request->validate(['paymentToken' => ['nullable', 'string', 'max:36']]);
        $order = PartnerCheckoutOrder::query()->where('public_reference', $reference)->firstOrFail();
        try {
            $result = $payments->start($order->id, $input['paymentToken'] ?? null);
        } catch (Throwable) {
            return response()->json(['success' => false, 'message' => 'Pagamento precisa de conferência.'], 409);
        }

        return response()->json(['success' => true, 'status' => 'payment_pending', 'pix' => $order->payment_method === 'pix' ? data_get($result, 'Payment.QrCodeString') : null]);
    }

    public function show(string $reference): JsonResponse
    {
        abort_unless($this->available(), 404);
        abort_unless((bool) preg_match('/\A[A-Za-z0-9]{40}\z/D', $reference), 404);
        $order = PartnerCheckoutOrder::query()->where('public_reference', $reference)->firstOrFail();

        return response()->json(['success' => true, 'status' => $order->status, 'propertyId' => $order->supplier_property_id, 'from' => $order->check_in->format('Y-m-d'), 'to' => $order->check_out->format('Y-m-d'), 'guests' => (int) $order->guests, 'baseCents' => (int) $order->base_cents, 'paymentCents' => (int) $order->payment_cents, 'method' => $order->payment_method, 'installments' => $order->installments, 'pix' => $order->status === 'payment_pending' && $order->payment_method === 'pix' ? $order->payment_qr_code : null])->header('Cache-Control', 'no-store');
    }

    public function reconcile(string $reference): JsonResponse
    {
        abort_unless($this->available(), 404);
        abort_unless((bool) preg_match('/\A[A-Za-z0-9]{40}\z/D', $reference), 404);
        $order = PartnerCheckoutOrder::query()->where('public_reference', $reference)->firstOrFail();
        if (in_array($order->status, ['payment_pending', 'payment_verified'], true) || ($order->status === 'attention_required' && $order->payment_id === null)) {
            CompletePartnerCheckout::dispatch($order->id)->afterCommit();
        }

        return response()->json(['success' => true, 'status' => $order->status], 202)->header('Cache-Control', 'no-store');
    }
}
