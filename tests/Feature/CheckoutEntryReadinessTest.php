<?php

namespace Tests\Feature;

use App\Services\DirectBookingCatalog;
use App\Services\DirectSaleTermsRegistry;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CheckoutEntryReadinessTest extends TestCase
{
    #[DataProvider('entryCases')]
    public function test_entry_requires_explicit_flag_approved_pilot_and_cielo_readiness(array $overrides, string $listingId, string $runtime, bool $entry, bool $preview): void
    {
        Http::preventStrayRequests();
        $production = $runtime === 'production';
        $this->app->instance('env', $runtime);
        config([
            'direct-booking.checkout_ui_enabled' => true,
            'direct-booking.enabled' => true,
            'direct-booking.payments_enabled' => true,
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.live_payments_enabled' => true,
            'direct-booking.payment_provider' => $production ? 'cielo' : 'cielo_sandbox',
            'direct-booking.pilot_listing_ids' => ['pilot-one', 'pilot-two'],
            'direct-booking.reservation_hold_minutes' => 90,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'test-provider',
            'direct-booking.notification_queue_connection' => 'database',
            'services.stays.client_id' => 'test-client',
            'services.stays.client_secret' => 'test-secret',
            'services.cielo.direct_environment' => $production ? 'production' : 'sandbox',
            'services.cielo.enabled' => true,
            'services.cielo.sop_enabled' => true,
            'services.cielo.merchant_id' => 'test-merchant',
            'services.cielo.merchant_key' => 'test-key',
            'services.cielo.sop_client_id' => 'test-sop-client',
            'services.cielo.sop_client_secret' => 'test-sop-secret',
            'services.cielo.production.enabled' => true,
            'services.cielo.production.sop_enabled' => true,
            'services.cielo.production.merchant_id' => 'test-production-merchant',
            'services.cielo.production.merchant_key' => 'test-production-key',
            'services.cielo.production.sop_client_id' => 'test-production-client',
            'services.cielo.production.sop_client_secret' => 'test-production-secret',
            'queue.connections.database' => ['driver' => 'database'],
            'mail.default' => 'smtp',
            'mail.mailers.smtp' => ['transport' => 'smtp'],
            'park-tickets.preview_enabled' => true,
            ...$overrides,
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, new class(app(DirectBookingCatalog::class)) extends DirectSaleTermsRegistry
        {
            protected function catalog(): array
            {
                return array_map(fn (string $id): array => [
                    'id' => $id,
                    'directSaleTermsVersion' => 'test-v1',
                    'directSaleTermsSnapshot' => [
                        'version' => 'test-v1',
                        'Preço e taxas' => 'Condições fictícias.',
                        'Cancelamento e reembolso' => 'Condições fictícias.',
                        'Forma e prazo de pagamento' => 'Condições fictícias.',
                        'Prazo da pré-reserva' => 'Condições fictícias.',
                        'Atendimento e suporte' => 'Condições fictícias.',
                    ],
                ], ['pilot-one', 'pilot-two', 'outside-pilot']);
            }
        });

        $this->getJson('/api/checkout/readiness/'.$listingId)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('singlePageCheckoutEnabled', $entry)
            ->assertJsonPath('parkTicketsPreviewEnabled', $preview)
            ->assertJsonMissing(['test-secret', 'test-production-secret']);
        Http::assertNothingSent();
    }

    public static function entryCases(): array
    {
        return [
            'UI disabled' => [['direct-booking.checkout_ui_enabled' => false], 'pilot-one', 'testing', false, false],
            'approved sandbox pilot' => [[], 'pilot-one', 'testing', true, true],
            'outside pilot even with terms' => [[], 'outside-pilot', 'testing', false, false],
            'unknown listing' => [[], 'unknown', 'testing', false, false],
            'incomplete pilot group' => [['direct-booking.pilot_listing_ids' => ['pilot-one']], 'pilot-one', 'testing', false, false],
            'payment disabled' => [['direct-booking.payments_enabled' => false], 'pilot-one', 'testing', false, false],
            'unsupported entry provider' => [['direct-booking.payment_provider' => 'cielo_checkout'], 'pilot-one', 'testing', false, false],
            'independent park switch' => [['park-tickets.preview_enabled' => false], 'pilot-one', 'testing', true, false],
            'production never shows demo tickets' => [[], 'pilot-one', 'production', true, false],
            'production charge gate off' => [['direct-booking.live_payments_enabled' => false], 'pilot-one', 'production', false, false],
        ];
    }
}
