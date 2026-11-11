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
        // Invalid keys cannot reach the service, including in an older client.
        if (! is_string($key) || ! preg_match('/^[A-Za-z0-9._~-]{16,128}$/D', $key)) {
            return $next($request);
        }

        $validator = Validator::make(array_merge($request->all(), ['idempotencyKey' => $key]),
            (new StoreExistingReservationCheckoutRequest)->rules());
        $valid = ! $validator->fails();
        $hash = hash('sha256', $key);
        $decision = DB::transaction(function () use ($hash, $key, $valid): string {
            $now = now();
            // Preserve keys already used before this protocol was introduced.
            $alreadyUsed = DB::table('direct_booking_orders')->where('idempotency_key', $key)->exists();
            DB::table('existing_checkout_intents')->insertOrIgnore([
                'key_hash' => $hash, 'state' => $valid || $alreadyUsed ? 'claimed' : 'rejected', 'created_at' => $now, 'updated_at' => $now,
            ]);
            $state = DB::table('existing_checkout_intents')->where('key_hash', $hash)->lockForUpdate()->value('state');

            return $state === 'claimed' ? ($valid ? 'continue' : 'conflict') : 'rejected';
        });

        if ($decision === 'continue') return $next($request);
        if ($decision === 'rejected' && ! $valid) {
            return response()->json(['message' => 'The given data was invalid.', 'errors' => $validator->errors()], 422)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json(['success' => false, 'code' => 'existing_checkout_intent_conflict'], 409)
            ->header('Cache-Control', 'no-store, private');
    }
}
