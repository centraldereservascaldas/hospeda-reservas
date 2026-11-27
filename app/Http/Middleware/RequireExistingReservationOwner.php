<?php

namespace App\Http\Middleware;

use App\Data\VerifiedGuest;
use App\Services\StaysExternalApiClient;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireExistingReservationOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        $guest = $request->attributes->get('verified_guest');
        $code = (string) $request->route('code');

        if (! $guest instanceof VerifiedGuest || ! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404);
        }

        $stays = app(StaysExternalApiClient::class);
        $reservation = $stays->get('/booking/reservations/'.$code);
        if (! is_array($reservation)) {
            return response()->json(['success' => false, 'message' => 'Não foi possível consultar esta reserva agora.'], 503);
        }

        $clientId = $reservation['_idclient'] ?? null;
        if (($reservation['id'] ?? null) !== $code || ! is_string($clientId) || $clientId === '') {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404);
        }

        $client = $stays->get('/booking/clients/'.rawurlencode($clientId));
        $reservationEmail = is_array($client) ? mb_strtolower(trim((string) ($client['email'] ?? ''))) : '';
        if ($reservationEmail === '' || ! hash_equals($reservationEmail, $guest->email)) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404);
        }

        $request->attributes->set('verified_existing_reservation', $reservation);

        return $next($request);
    }
}
