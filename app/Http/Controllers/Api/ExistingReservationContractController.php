<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AcceptExistingReservationContractRequest;
use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationContractEligibility;
use App\Services\ExistingReservationPaymentLock;
use App\Services\LegalPageRegistry;
use Illuminate\Http\JsonResponse;

class ExistingReservationContractController extends Controller
{
    public function store(AcceptExistingReservationContractRequest $request, string $publicReference, LegalPageRegistry $pages, ExistingReservationPaymentLock $lock): JsonResponse
    {
        $token = (string) $request->header('X-Checkout-Resume-Token', '');
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        if (! $order || $order->origin !== 'stays_existing' || ! $order->hasValidResumeToken($token)
            || ! is_string($order->stays_reservation_id) || ! preg_match('/^[a-f0-9]{24}$/iD', $order->stays_reservation_id)) {
            return response()->json(['success' => false, 'code' => 'checkout_not_found'], 404)->header('Cache-Control', 'no-store, private');
        }

        $data = $request->validated();
        $accepted = $lock->synchronized($order->stays_reservation_id, function () use ($order, $token, $data, $pages): bool {
            $current = DirectBookingOrder::query()->lockForUpdate()->find($order->id);
            if (! $current || $current->origin !== 'stays_existing' || ! $current->hasValidResumeToken($token)) {
                return false;
            }
            $terms = is_array($current->accepted_terms_snapshot) ? $current->accepted_terms_snapshot : [];
            if (array_key_exists('contract', $terms) || array_key_exists('contract_content_hash', $terms)) {
                return is_array($terms['contract'] ?? null)
                    && ($terms['contract']['version'] ?? null) === $data['version']
                    && is_string($terms['contract_content_hash'] ?? null)
                    && hash_equals($terms['contract_content_hash'], $data['contentHash'])
                    && hash_equals($terms['contract_content_hash'], hash('sha256', json_encode($terms['contract'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
            }
            $contract = $pages->find('contrato');
            $hash = is_array($contract) ? hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) : null;
            if (! is_array($contract) || ($contract['version'] ?? null) !== $data['version'] || ! hash_equals((string) $hash, $data['contentHash'])
                || $current->expires_at === null || ! $current->expires_at->isFuture()) {
                return false;
            }
            $eligible = app(ExistingReservationContractEligibility::class)->canAccept($current, lockAttempts: true);
            if (! $eligible) {
                return false;
            }
            $terms['contract'] = $contract;
            $terms['contract_content_hash'] = $hash;
            $current->forceFill(['accepted_terms_snapshot' => $terms, 'terms_accepted_at' => now()])->save();

            return true;
        });

        return response()->json(['success' => $accepted, 'code' => $accepted ? 'existing_contract_accepted' : 'existing_contract_unavailable'], $accepted ? 200 : 409)
            ->header('Cache-Control', 'no-store, private');
    }
}
