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

    public function test_general_rollout_accepts_approved_listing_without_pilot_ids_and_rejects_incomplete_terms(): void
    {
        config(['direct-booking.rollout_mode' => 'all_approved', 'direct-booking.pilot_listing_ids' => []]);
        $approved = $this->listing('approved');
        $approved['staysListingId'] = 'stays-approved';
        $incomplete = $this->listing('incomplete');
        unset($incomplete['directSaleTermsSnapshot']['Cancelamento e reembolso']);
        $registry = $this->registry([$approved, $incomplete]);

        $this->assertSame($approved, $registry->findApprovedListing('stays-approved'));
        $this->assertNull($registry->findApprovedListing('incomplete'));
        $this->assertNull($registry->findApprovedListing('unknown'));
        $this->assertFalse($registry->allListingsHaveApprovedTerms());
        $this->assertTrue($this->registry([$approved])->allListingsHaveApprovedTerms());
        $this->assertFalse($this->registry([])->allListingsHaveApprovedTerms());
    }

    public function test_invalid_rollout_mode_does_not_release_an_approved_listing(): void
    {
        config(['direct-booking.rollout_mode' => 'invalid', 'direct-booking.pilot_listing_ids' => ['first', 'second']]);

        $this->assertNull($this->registry([$this->listing('first'), $this->listing('second')])->findApprovedListing('first'));
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
