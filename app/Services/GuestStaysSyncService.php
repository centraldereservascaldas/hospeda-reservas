<?php

namespace App\Services;

use App\Data\VerifiedGuest;
use App\Models\GuestProfile;

class GuestStaysSyncService
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    public function sync(VerifiedGuest $guest): ?string
    {
        $profile = GuestProfile::query()->find($guest->id);
        if ($profile?->stays_client_id) {
            return $profile->stays_client_id;
        }

        $clients = $this->stays->get('/booking/clients', ['email' => $guest->email, 'limit' => 20]);
        if (! is_array($clients)) {
            return null;
        }

        $clients = $clients['clients'] ?? $clients;
        $client = collect(is_array($clients) ? $clients : [])->first(
            fn (array $item): bool => mb_strtolower(trim((string) ($item['email'] ?? ''))) === $guest->email,
        );
        $clientId = (string) ($client['_id'] ?? $client['id'] ?? '');

        if ($client && $clientId === '') {
            return null;
        }

        if ($client && ($client['isUser'] ?? false) !== true) {
            $activated = $this->stays->request('PATCH', '/booking/clients/'.rawurlencode($clientId), payload: ['isUser' => true]);
            if (! $activated?->successful()) {
                return null;
            }
        }

        if (! $client) {
            $parts = preg_split('/\\s+/', trim($guest->fullName), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $response = $this->stays->request('POST', '/booking/clients', payload: [
                'kind' => 'person',
                'fName' => $parts[0] ?? '',
                'lName' => implode(' ', array_slice($parts, 1)),
                'email' => $guest->email,
                'isUser' => true,
                'prefLang' => 'pt_BR',
            ]);
            $clientId = (string) ($response?->json('_id') ?? $response?->json('id') ?? '');
            if (! $response?->successful() || $clientId === '') {
                return null;
            }
        }

        GuestProfile::query()->updateOrCreate(
            ['id' => $guest->id],
            ['full_name' => $guest->fullName, 'stays_client_id' => $clientId, 'stays_synced_at' => now()],
        );

        return $clientId;
    }
}
