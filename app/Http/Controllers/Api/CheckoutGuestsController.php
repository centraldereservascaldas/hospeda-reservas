<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\DirectBookingOrder;
use App\Services\DirectStaysReservationMatcher;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutGuestsController extends Controller
{
    public function store(Request $request, string $publicReference, StaysExternalApiClient $stays, DirectStaysReservationMatcher $matcher): JsonResponse
    {
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        $guest = $request->attributes->get('verified_guest');
        $owner = $guest instanceof VerifiedGuest && hash_equals($order?->guest_email ?? '', mb_strtolower(trim($guest->email)));
        if (! $order || (! $owner && ! $order->hasValidResumeToken((string) $request->header('X-Checkout-Resume-Token', '')))) {
            return response()->json(['success' => false, 'message' => 'Pedido não encontrado.'], 404)->header('Cache-Control', 'no-store, private');
        }

        $data = $request->validate([
            'holder' => ['required', 'array:name,document,phone'],
            'holder.name' => ['required', 'string', 'max:180', 'not_regex:/[\r\n]/'],
            'holder.document' => ['required', 'string', 'max:30', 'regex:/^[\pL\pN .\/-]+$/u'],
            'holder.phone' => ['required', 'string', 'max:30', 'regex:/^[0-9+() .-]+$/'],
            'companions' => ['present', 'array', 'max:49'],
            'companions.*' => ['required', 'array:name,document'],
            'companions.*.name' => ['required', 'string', 'max:180', 'not_regex:/[\r\n]/'],
            'companions.*.document' => ['required', 'string', 'max:30', 'regex:/^[\pL\pN .\/-]+$/u'],
        ]);

        $result = DB::transaction(function () use ($order, $data, $stays, $matcher): array {
            $order = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            $capacity = collect($order->guests)->only(['adults', 'children', 'infants'])->sum();
            if ($order->payment_status !== 'approved' || $order->reservation_status !== 'booked' || ! $order->stays_reservation_id) {
                return [409, 'A reserva ainda está em confirmação. Tente novamente em instantes.'];
            }
            if (count($data['companions']) + 1 > $capacity) {
                return [422, 'A quantidade de hóspedes excede o total da reserva.'];
            }
            $path = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
            $reservation = $stays->get($path);
            if (! is_array($reservation) || ! $matcher->matchesIdentity($reservation, $order) || ($reservation['type'] ?? null) !== 'booked') {
                return [503, 'Não foi possível confirmar a reserva. Tente novamente.'];
            }

            $start = "\n[CRCN DADOS HOSPEDES INICIO]\n";
            $end = "\n[CRCN DADOS HOSPEDES FIM]";
            $note = (string) ($reservation['internalNote'] ?? '');
            if (str_contains($note, $start) || str_contains($note, $end)) {
                if (substr_count($note, $start) !== 1 || substr_count($note, $end) !== 1 || strpos($note, $end) < strpos($note, $start)) {
                    return [409, 'As observações precisam de conferência pela equipe.'];
                }
                $note = substr($note, 0, strpos($note, $start)).substr($note, strpos($note, $end) + strlen($end));
            }
            $lines = ['Titular: '.trim($data['holder']['name']), 'Documento: '.trim($data['holder']['document']), 'Telefone: '.trim($data['holder']['phone'])];
            foreach ($data['companions'] as $index => $companion) {
                $lines[] = 'Acompanhante '.($index + 1).': '.trim($companion['name']).' | Documento: '.trim($companion['document']);
            }
            $newNote = $note.$start.implode("\n", $lines).$end;
            $response = $stays->request('PATCH', $path, payload: ['type' => 'booked', 'internalNote' => $newNote]);
            $verified = $stays->get($path);
            if (! $response?->successful() || ! is_array($verified) || ! $matcher->matchesIdentity($verified, $order)
                || ($verified['internalNote'] ?? null) !== $newNote) {
                return [503, 'Não foi possível confirmar o envio dos dados. Confira e tente novamente.'];
            }

            return [200, 'Dados dos hóspedes registrados na reserva.'];
        });

        return response()->json(['success' => $result[0] === 200, 'message' => $result[1]], $result[0])->header('Cache-Control', 'no-store, private');
    }
}
