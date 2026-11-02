<?php

namespace Tests\Feature;

use App\Services\DirectBookingCatalog;
use App\Services\DirectSaleTermsRegistry;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DirectBookingCatalogTest extends TestCase
{
    public function test_live_listing_absent_from_old_catalog_is_eligible_with_its_own_current_policy(): void
    {
        $this->configureLiveCatalog();
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/content/listings*' => Http::response([
                ['id' => 'NEW01', '_id' => 'object-new', '_i_maxGuests' => 6, '_mstitle' => ['pt_BR' => 'Novo apartamento']],
            ]),
            'https://stays.test/external/v1/settings/listing/NEW01/booking' => Http::response([
                'policy' => ['_id' => 'policy-one', '_t_meta' => ['_msdesc' => ['pt_BR' => '<p>Cancelamento conforme a tarifa contratada.</p>']]],
            ]),
        ]);

        $registry = app(DirectSaleTermsRegistry::class);
        $listing = $registry->findApprovedListing('object-new');

        $this->assertSame('NEW01', $listing['id']);
        $this->assertSame(6, $listing['maxGuests']);
        $this->assertSame('Cancelamento conforme a tarifa contratada.', $listing['directSaleTermsSnapshot']['Cancelamento e reembolso']);
        $this->assertSame('support@example.test', $listing['directSaleTermsSnapshot']['Atendimento e suporte']);
        $this->assertSame($listing['directSaleTermsVersion'], $registry->findApprovedListing('NEW01')['directSaleTermsVersion']);
        $this->assertNull($registry->findApprovedListing('old-only'));
        Http::assertSentCount(2);
    }

    public function test_policy_name_alone_does_not_approve_purchase_terms(): void
    {
        $this->configureLiveCatalog();
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/content/listings*' => Http::response([
                ['id' => 'NEW01', '_i_maxGuests' => 2],
            ]),
            'https://stays.test/external/v1/settings/listing/NEW01/booking' => Http::response([
                'policy' => ['_t_meta' => ['internalName' => 'Rigorosa', '_mstitle' => ['pt_BR' => 'Rigorosa']]],
            ]),
        ]);

        $this->assertNull(app(DirectSaleTermsRegistry::class)->findApprovedListing('NEW01'));
        Http::assertSentCount(2);
    }

    public function test_unavailable_live_catalog_does_not_fall_back_to_old_listings_or_cache_failure(): void
    {
        $this->configureLiveCatalog();
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/content/listings*' => Http::sequence()
                ->pushStatus(503)
                ->push([['id' => 'RECOVERED', '_i_maxGuests' => 4]]),
        ]);
        try {
            app(DirectBookingCatalog::class)->listings();
            $this->fail('An unavailable live catalog must not use static listings.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Checkout catalog unavailable.', $exception->getMessage());
        }

        $this->assertSame('RECOVERED', app(DirectBookingCatalog::class)->listings()[0]['id']);
        Http::assertSentCount(2);
    }

    public function test_approved_direct_policy_is_selected_by_exact_id_instead_of_its_name(): void
    {
        $this->configureLiveCatalog();
        config(['direct_sale_policies.approved-id.description' => 'Regra de reservas diretas aprovada.']);
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/settings/listing/KNOWN/booking' => Http::response([
                'policy' => ['_id' => 'approved-id', '_t_meta' => ['internalName' => 'Rigorosa']],
            ]),
            'https://stays.test/external/v1/settings/listing/OTHER/booking' => Http::response([
                'policy' => ['_id' => 'other-id', '_t_meta' => ['internalName' => 'Rigorosa']],
            ]),
        ]);
        $catalog = app(DirectBookingCatalog::class);

        $known = $catalog->withTerms(['id' => 'KNOWN', 'staysListingId' => 'KNOWN']);
        $other = $catalog->withTerms(['id' => 'OTHER', 'staysListingId' => 'OTHER']);

        $this->assertSame('Regra de reservas diretas aprovada.', $known['directSaleTermsSnapshot']['Cancelamento e reembolso']);
        $this->assertArrayNotHasKey('directSaleTermsSnapshot', $other);
        Http::assertSentCount(2);
    }

    private function configureLiveCatalog(): void
    {
        config([
            'cache.default' => 'array',
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'synthetic-id',
            'services.stays.client_secret' => 'synthetic-secret',
            'direct-booking.catalog_source' => 'stays',
            'direct-booking.rollout_mode' => 'all_approved',
            'direct-booking.stays_terms_enabled' => true,
            'direct-booking.support_email' => 'support@example.test',
            'direct-booking.reservation_hold_minutes' => 60,
            'direct-booking.pilot_listing_ids' => [],
        ]);
    }
}
