<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use RuntimeException;

class DirectBookingCatalog
{
    public function __construct(private readonly StaysExternalApiClient $stays, private readonly StaysPublicContentMapper $mapper) {}

    /** @return list<array<string, mixed>> */
    public function listings(): array
    {
        $account = hash('sha256', (string) config('services.stays.base_url').'|'.(string) config('services.stays.client_id'));
        $raw = Cache::remember('direct-booking.catalog.v1.'.$account, 300, function (): array {
            return $this->stays->activeListings() ?? throw new RuntimeException('Checkout catalog unavailable.');
        });
        $listings = [];
        foreach ($raw as $listing) {
            $id = $this->mapper->identifier($listing['id'] ?? $listing['code'] ?? $listing['_id'] ?? null);
            $capacity = filter_var($listing['_i_maxGuests'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($id === '' || $capacity === false) {
                continue;
            }
            $listings[] = [
                'id' => $id,
                'staysListingId' => $id,
                'staysListingObjectId' => $this->mapper->identifier($listing['_id'] ?? null),
                'title' => $this->mapper->text($listing['_mstitle'] ?? null),
                'maxGuests' => $capacity,
            ];
        }

        return $listings;
    }

    /** @param array<string, mixed> $listing
     * @return array<string, mixed>
     */
    public function withTerms(array $listing): array
    {
        if (! config('direct-booking.stays_terms_enabled', false)) {
            return $listing;
        }
        $id = $listing['staysListingId'];
        $account = hash('sha256', (string) config('services.stays.base_url').'|'.(string) config('services.stays.client_id'));
        $settings = Cache::remember('direct-booking.terms.v1.'.$account.'.'.$id, 300, function () use ($id): array {
            return $this->stays->get('/settings/listing/'.rawurlencode($id).'/booking')
                ?? throw new RuntimeException('Checkout booking terms unavailable.');
        });
        $cancellation = $this->mapper->text(data_get($settings, 'policy._t_meta._msdesc'));
        if ($cancellation === '') {
            $policyId = $this->mapper->identifier(data_get($settings, 'policy._id'));
            $cancellation = $policyId !== ''
                ? $this->mapper->text(config('direct_sale_policies.'.$policyId.'.description'))
                : '';
        }
        $support = config('direct-booking.support_email');
        $hold = filter_var(config('direct-booking.reservation_hold_minutes'), FILTER_VALIDATE_INT);
        if ($cancellation === '' || ! is_string($support) || ! filter_var($support, FILTER_VALIDATE_EMAIL) || $hold === false || $hold < 1) {
            return $listing;
        }
        $snapshot = [
            'Preço e taxas' => 'O total da hospedagem e as taxas são revalidados antes do pagamento. Pix sem acréscimo. No cartão, o total final é exibido conforme as parcelas escolhidas.',
            'Cancelamento e reembolso' => $cancellation,
            'Forma e prazo de pagamento' => 'Pagamento integral via Pix ou cartão em até 6 parcelas. A reserva depende da aprovação do pagamento e da confirmação da hospedagem.',
            'Prazo da pré-reserva' => 'A pré-reserva tem validade de '.$hold.' minutos. Observe a validade do Pix exibida na tela de pagamento.',
            'Atendimento e suporte' => $support,
        ];
        $version = 'stays-'.hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return [...$listing, 'directSaleTermsVersion' => $version, 'directSaleTermsSnapshot' => ['version' => $version, ...$snapshot]];
    }
}
