<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\DirectBookingOrder;
use App\Rules\ValidCpf;
use App\Services\ApartmentGuestCapacity;
use App\Services\DirectStaysReservationMatcher;
use App\Services\ExistingReservationPaymentGuard;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutGuestsController extends Controller
{
    public function store(Request $request, string $publicReference, StaysExternalApiClient $stays, DirectStaysReservationMatcher $matcher, ExistingReservationPaymentGuard $existingGuard, ApartmentGuestCapacity $guestCapacity): JsonResponse
    {
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        $guest = $request->attributes->get('verified_guest');
        $owner = $guest instanceof VerifiedGuest && hash_equals($order?->guest_email ?? '', mb_strtolower(trim($guest->email)));
        if (! $order || (! $owner && ! $order->hasValidResumeToken((string) $request->header('X-Checkout-Resume-Token', '')))) {
            return response()->json(['success' => false, 'message' => 'Pedido não encontrado.'], 404)->header('Cache-Control', 'no-store, private');
        }

        $data = $request->validate([
            'holder' => ['required', 'array:name,document,phone,email'],
            'holder.name' => ['required', 'string', 'max:180', 'not_regex:/[\r\n]/'],
            'holder.document' => [
                'required', 'string', 'max:30', 'regex:/^[\pL\pN .\/-]+$/u',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (is_string($value) && ValidCpf::isCpfDocument($value) && ! ValidCpf::isValid($value)) {
                        $fail('Informe um CPF válido ou outro documento.');
                    }
                },
            ],
            'holder.phone' => ['required', 'string', 'max:30', 'regex:/^[0-9+() .-]+$/'],
            'holder.email' => ['sometimes', 'nullable', 'email', 'max:254'],
            'companions' => ['present', 'array', 'max:49'],
            'companions.*' => ['required', 'array:name,document'],
            'companions.*.name' => ['required', 'string', 'max:180', 'not_regex:/[\r\n]/'],
            'companions.*.document' => [
                'required', 'string', 'max:30', 'regex:/^[\pL\pN .\/-]+$/u',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (is_string($value) && ValidCpf::isCpfDocument($value) && ! ValidCpf::isValid($value)) {
                        $fail('Informe um CPF válido ou outro documento.');
                    }
                },
            ],
        ]);

        $result = DB::transaction(function () use ($order, $data, $stays, $matcher, $existingGuard, $guestCapacity): array {
            $order = DirectBookingOrder::query()->lockForUpdate()->findOrFail($order->id);
            if ($order->payment_status !== 'approved' || $order->reservation_status !== 'booked' || ! $order->stays_reservation_id) {
                return [409, 'A reserva ainda está em confirmação. Tente novamente em instantes.'];
            }
            $path = '/booking/reservations/'.rawurlencode($order->stays_reservation_id);
            $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
            $matches = fn (array $reservation): bool => $order->origin === 'stays_existing'
                ? is_array($snapshot) && $existingGuard->matchesReservation($reservation, $snapshot)
                : $matcher->matchesIdentity($reservation, $order);
            $reservation = $stays->get($path);
            if (! is_array($reservation) || ! $matches($reservation) || ($reservation['type'] ?? null) !== 'booked') {
                return [503, 'Não foi possível confirmar a reserva. Tente novamente.'];
            }
            $quoteSnapshot = is_array($order->quote_snapshot) ? $order->quote_snapshot : [];
            $apartmentCapacity = filter_var(
                $quoteSnapshot['apartment_max_guests'] ?? null,
                FILTER_VALIDATE_INT,
                ['options' => ['min_range' => 1, 'max_range' => 50]],
            );
            if ($apartmentCapacity === false || $apartmentCapacity === null) {
                $apartmentCapacity = $guestCapacity->forListingId($order->stays_listing_id);
            }
            if ($apartmentCapacity === null) {
                return [503, 'Não foi possível confirmar a capacidade do imóvel. Tente novamente ou fale com a Central.'];
            }
            if (count($data['companions']) + 1 > $apartmentCapacity) {
                return [422, 'A quantidade informada não pode ser enviada. Revise os hóspedes e tente novamente.'];
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
            if (filled($data['holder']['email'] ?? null)) {
                $lines[] = 'E-mail: '.trim($data['holder']['email']);
            }
            foreach ($data['companions'] as $index => $companion) {
                $lines[] = 'Acompanhante '.($index + 1).': '.trim($companion['name']).' | Documento: '.trim($companion['document']);
            }
            $newNote = $note.$start.implode("\n", $lines).$end;
            $response = $stays->request('PATCH', $path, payload: ['type' => 'booked', 'internalNote' => $newNote]);
            $verified = $stays->get($path);
            if (! $response?->successful() || ! is_array($verified) || ! $matches($verified)
                || ($verified['internalNote'] ?? null) !== $newNote) {
                return [503, 'Não foi possível confirmar o envio dos dados. Confira e tente novamente.'];
            }

            return [200, 'Dados dos hóspedes registrados na reserva.'];
        });

        return response()->json(['success' => $result[0] === 200, 'message' => $result[1]], $result[0])->header('Cache-Control', 'no-store, private');
    }
}
