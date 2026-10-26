<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Services\DirectBookingCancellationRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CheckoutCancellationController extends Controller
{
    public function store(
        Request $request,
        string $publicReference,
        DirectBookingCancellationRequestService $cancellations,
    ): JsonResponse {
        $guest = $request->attributes->get('verified_guest');
        $guest = $guest instanceof VerifiedGuest ? $guest : null;
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $publicReference)) {
            return $this->notFound();
        }

        $result = $cancellations->request(
            $publicReference,
            $guest,
            (string) $request->header('X-Checkout-Resume-Token', ''),
        );

        if ($result['status'] === 'not_found') {
            return $this->notFound();
        }
        if ($result['status'] === 'not_cancellable') {
            return response()->json([
                'success' => false,
                'code' => 'direct_booking_not_cancellable',
                'message' => 'Este pedido não está em um estado que permita solicitar cancelamento. Nenhuma alteração foi feita.',
            ], 409)->header('Cache-Control', 'no-store, private');
        }

        return response()->json([
            'success' => true,
            'cancellationStatus' => 'requested',
            'alreadyRequested' => $result['status'] === 'already_requested',
            'cancellationReceipt' => $result['receipt'],
            'message' => 'A solicitação de cancelamento foi recebida para análise da Central; o cancelamento ainda não foi concluído.',
        ])->header('Cache-Control', 'no-store, private');
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'code' => 'checkout_not_found',
            'message' => 'Pedido não encontrado.',
        ], 404)->header('Cache-Control', 'no-store, private');
    }
}
