<?php

namespace App\Http\Middleware;

use App\Http\Requests\StoreExistingReservationCheckoutRequest;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\Response;

class GuardExistingCheckoutIntent
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('direct-booking.experimental_existing_intent_guard_enabled', false) !== true) {
            return $next($request);
        }

        $key = $request->header('Idempotency-Key');
        if (! is_string($key) || ! preg_match('/^[A-Za-z0-9._~-]{16,128}$/D', $key)) {
            return $next($request);
        }

        $validator = Validator::make(array_merge($request->all(), ['idempotencyKey' => $key]),
            (new StoreExistingReservationCheckoutRequest)->rules());
        $valid = ! $validator->fails();
        $hash = hash('sha256', $key);
        $fingerprint = null;
        if ($valid) {
            $secret = config('app.key');
            $code = $request->route('code');
            if (! is_string($secret) || $secret === '' || ! is_string($code)) {
                return response()->json(['success' => false, 'code' => 'existing_checkout_intent_unavailable'], 503)
                    ->header('Cache-Control', 'no-store, private');
            }
            try {
                $data = $validator->validated();
                // Mirror the service fingerprint: retain guest ordering and balance type,
                // but normalize acceptedPayment and installments as the service does.
                $serialized = json_encode(['version' => 1, 'code' => $code, 'data' => [
                    $data['expectedBalanceCents'], $data['guest'], $data['paymentMethod'],
                    $data['paymentMethod'] === 'card' ? (int) $data['installments'] : null, true,
                ]], JSON_THROW_ON_ERROR);
                $fingerprint = hash_hmac('sha256', "existing-checkout-intent-v1\0".$serialized, $secret);
            } catch (\JsonException $exception) {
                return response()->json(['success' => false, 'code' => 'existing_checkout_intent_unavailable'], 503)
                    ->header('Cache-Control', 'no-store, private');
            }
        }
        $decision = DB::transaction(function () use ($hash, $key, $valid, $fingerprint): string {
            $now = now();
            // A legacy order has no trustworthy payload binding, so it cannot be claimed retroactively.
            $alreadyUsed = DB::table('direct_booking_orders')->where('idempotency_key', $key)->exists();
            DB::table('existing_checkout_intents')->insertOrIgnore([
                'key_hash' => $hash, 'state' => $valid || $alreadyUsed ? 'claimed' : 'rejected',
                'payload_hmac' => $alreadyUsed ? null : $fingerprint, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $intent = DB::table('existing_checkout_intents')->where('key_hash', $hash)->lockForUpdate()->first();
            if ($intent->state !== 'claimed') return 'rejected';

            return $valid && is_string($intent->payload_hmac) && hash_equals($intent->payload_hmac, $fingerprint)
                ? 'continue' : 'conflict';
        });

        if ($decision === 'continue') {
            $request->attributes->set('existing_checkout_intent_verified', true);

            return $next($request);
        }
        if ($decision === 'rejected' && ! $valid) {
            return response()->json(['message' => 'The given data was invalid.', 'errors' => $validator->errors()], 422)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json(['success' => false, 'code' => 'existing_checkout_intent_conflict'], 409)
            ->header('Cache-Control', 'no-store, private');
    }
}
