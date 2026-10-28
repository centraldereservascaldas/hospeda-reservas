<?php

namespace Tests\Feature;

use App\Services\DirectSaleTermsRegistry;
use Tests\TestCase;

class DirectSaleTermsRegistryTest extends TestCase
{
    public function test_every_pilot_needs_valid_terms_before_any_pilot_is_approved(): void
    {
        config(['direct-booking.pilot_listing_ids' => ['first', 'second']]);
        $first = $this->listing('first');
        $second = $this->listing('second');
        unset($second['directSaleTermsSnapshot']['Atendimento e suporte']);

        $registry = $this->registry([$first, $second]);
        $this->assertNull($registry->findApprovedListing('first'));
        $this->assertNull($registry->findApprovedListing('second'));

        $registry = $this->registry([$first, $this->listing('second')]);
        $this->assertSame($first, $registry->findApprovedListing('first'));
        $this->assertSame('second', $registry->findApprovedListing('second')['id']);
    }

    /** @return array<string, mixed> */
    private function listing(string $id): array
    {
        return [
            'id' => $id,
            'staysListingId' => $id,
            'directSaleTermsVersion' => 'terms-1',
            'directSaleTermsSnapshot' => [
                'version' => 'terms-1',
                'Preço e taxas' => 'Preço total e taxas definidos.',
                'Cancelamento e reembolso' => 'Condições definidas.',
                'Forma e prazo de pagamento' => 'Condições definidas.',
                'Prazo da pré-reserva' => 'Condições definidas.',
                'Atendimento e suporte' => 'Contato definido.',
            ],
        ];
    }

    /** @param list<array<string, mixed>> $listings */
    private function registry(array $listings): DirectSaleTermsRegistry
    {
        return new class($listings) extends DirectSaleTermsRegistry
        {
            /** @param list<array<string, mixed>> $listings */
            public function __construct(private readonly array $listings) {}

            protected function catalog(): array
            {
                return $this->listings;
            }
        };
    }
}
