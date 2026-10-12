<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Models\OwnerAccess;
use App\Services\StaysExternalApiClient;
use App\Services\SupabaseAuthClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerAdminController extends Controller
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    public function status(Request $request): JsonResponse
    {
        $admins = config('services.hospeda.owner_admin_emails', []);
        if ($admins === []) {
            return response()->json(['success' => true, 'isAdmin' => false]);
        }
        $guest = $request->attributes->get('verified_guest');
        if (! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_session'], 401);
        }

        return response()->json(['success' => true, 'isAdmin' => in_array($guest->email, $admins, true)]);
    }

    public function requests(): JsonResponse
    {
        $requests = OwnerAccess::query()->where('status', 'pending')->orderBy('created_at')->limit(200)->get();
        $authClient = app(SupabaseAuthClient::class);

        return response()->json(['success' => true, 'requests' => $requests->map(function (OwnerAccess $item) use ($authClient): array {
            $user = $authClient->getAdminUser($item->user_id);

            return ['userId' => $item->user_id, 'fullName' => $item->full_name ?: ($user['user_metadata']['full_name'] ?? ''), 'email' => $user['email'] ?? '', 'requestedAt' => $item->created_at?->toISOString()];
        })]);
    }

    public function staysOwners(Request $request): JsonResponse
    {
        $query = mb_strtolower(trim((string) $request->query('q', '')));
        if (mb_strlen($query) < 2 || mb_strlen($query) > 160) {
            return response()->json(['success' => false, 'code' => 'owner_search_invalid', 'message' => 'Digite ao menos 2 caracteres para pesquisar.'], 400);
        }
        $owners = $this->stays->ownerDirectory();
        if (! is_array($owners)) {
            return response()->json(['success' => false, 'code' => 'stays_owners_unavailable', 'message' => 'A lista de proprietários não pôde ser carregada da Stays.'], 502);
        }
        $matches = collect($owners)->map(fn (array $owner): array => ['id' => (string) ($owner['_id'] ?? $owner['id'] ?? ''), 'name' => (string) ($owner['name'] ?? trim(($owner['fName'] ?? '').' '.($owner['lName'] ?? '')))])
            ->filter(fn (array $owner): bool => str_contains(mb_strtolower($owner['id'].' '.$owner['name']), $query))->take(50)->values();

        return response()->json(['success' => true, 'owners' => $matches, 'total' => $matches->count()]);
    }

    public function approve(Request $request): JsonResponse
    {
        $input = $request->validate(['userId' => ['required', 'uuid'], 'staysOwnerId' => ['required', 'string', 'max:160'], 'identityVerified' => ['required', 'accepted']]);
        $owner = OwnerAccess::query()->find($input['userId']);
        if (! $owner) {
            return response()->json(['success' => false, 'code' => 'owner_request_not_found', 'message' => 'A solicitação não foi encontrada.'], 404);
        }
        if ($owner->status !== 'pending') {
            return response()->json(['success' => false, 'code' => 'owner_request_not_pending', 'message' => 'Esta solicitação já foi analisada.'], 409);
        }
        $owners = $this->stays->ownerDirectory();
        $staysOwner = collect(is_array($owners) ? $owners : [])->first(fn (array $item): bool => (string) ($item['_id'] ?? $item['id'] ?? '') === $input['staysOwnerId']);
        if (! $staysOwner) {
            return response()->json(['success' => false, 'code' => 'stays_owner_not_found', 'message' => 'O proprietário selecionado não foi encontrado na lista atual da Stays.'], 400);
        }
        if (OwnerAccess::query()->where('stays_owner_id', $input['staysOwnerId'])->where('user_id', '!=', $input['userId'])->exists()) {
            return response()->json(['success' => false, 'code' => 'stays_owner_already_linked', 'message' => 'Este proprietário já está vinculado a outra conta do site.'], 409);
        }
        $reviewer = request()->attributes->get('verified_guest');
        $updated = OwnerAccess::query()->where('user_id', $input['userId'])->where('status', 'pending')->update(['status' => 'approved', 'stays_owner_id' => $input['staysOwnerId'], 'approved_at' => now(), 'reviewed_at' => now(), 'reviewed_by' => $reviewer instanceof VerifiedGuest ? $reviewer->id : null]);
        if ($updated !== 1) {
            return response()->json(['success' => false, 'code' => 'owner_approval_failed', 'message' => 'Não foi possível concluir a aprovação; atualize a lista e tente novamente.'], 409);
        }

        return response()->json(['success' => true, 'status' => 'approved']);
    }
}
