<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\OwnerAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerAccessController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $access = OwnerAccess::query()->find($guest->id);
        if (! $access) {
            return response()->json(['success' => true, 'status' => 'none']);
        }

        return response()->json(['success' => true, 'status' => $access->status]);
    }

    public function requestAccess(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }
        $access = OwnerAccess::query()->find($guest->id);
        if ($access?->status === 'approved' || $access?->status === 'pending') {
            return response()->json(['success' => true, 'status' => $access->status]);
        }
        if (in_array($access?->status, ['suspended', 'rejected'], true)) {
            return response()->json(['success' => false, 'code' => 'owner_access_not_available', 'message' => 'Entre em contato com a Central para revisar o acesso.'], 403);
        }
        OwnerAccess::query()->updateOrCreate(['user_id' => $guest->id], ['full_name' => $guest->fullName, 'status' => 'pending', 'stays_owner_id' => null, 'approved_at' => null]);

        return response()->json(['success' => true, 'status' => 'pending']);
    }
}
