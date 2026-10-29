<?php

namespace Tests\Feature;

use App\Services\DirectSaleTermsRegistry;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CheckDirectBookingReadinessTest extends TestCase
{
    public function test_reports_configured_prerequisites_without_enabling_flags_or_exposing_values(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $exitCode = Artisan::call('direct-booking:check-readiness', ['--json' => true]);
        $output = Artisan::output();
        $result = json_decode($output, true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(0, $exitCode);
        $this->assertTrue($result['prerequisites_configured']);
        $this->assertFalse($result['flags']['DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED']['enabled']);
        $this->assertTrue($result['optional_checks']['VITE_MERCADO_PAGO_PUBLIC_KEY']['configured']);
        $this->assertStringContainsString('não declara prontidão para lançamento', $result['scope']);
        $this->assertStringNotContainsString('sentinel-', $output);
        Http::assertNothingSent();
    }

    public function test_missing_public_key_is_reported_as_optional_for_pix_prerequisites(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config(['services.mercadopago.public_key' => null]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $exitCode = Artisan::call('direct-booking:check-readiness', ['--json' => true]);
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(0, $exitCode);
        $this->assertFalse($result['optional_checks']['VITE_MERCADO_PAGO_PUBLIC_KEY']['configured']);
        Http::assertNothingSent();
    }

    public function test_rejects_hold_below_one_minute_even_when_thresholds_are_negative(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'direct-booking.reservation_hold_minutes' => 0,
            'direct-booking.pix_minimum_remaining_minutes' => -30,
            'direct-booking.payment_safety_margin_minutes' => -5,
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $exitCode = Artisan::call('direct-booking:check-readiness', ['--json' => true]);
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(1, $exitCode);
        $this->assertFalse($result['checks']['DIRECT_BOOKING_RESERVATION_HOLD_MINUTES']['configured']);
        Http::assertNothingSent();
    }

    public function test_reports_missing_configuration_as_pending_and_returns_failure(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config(['services.mercadopago.access_token' => null]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $exitCode = Artisan::call('direct-booking:check-readiness', ['--json' => true]);
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(1, $exitCode);
        $this->assertFalse($result['checks']['MERCADO_PAGO_ACCESS_TOKEN']['configured']);
        Http::assertNothingSent();
    }

    public function test_rejects_invalid_configuration_types_and_incomplete_pilot_terms(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'services.mercadopago.access_token' => ['sentinel-secret'],
            'services.mercadopago.webhook_queue_connection' => ['database'],
            'queue.connections.database' => 'database',
            'services.stays.base_url' => 'ftp://stays.example.test/external/v1',
            'direct-booking.stays_payment_type' => ['credit'],
            'direct-booking.reservation_hold_minutes' => ['not-an-integer'],
            'mail.default' => ['array'],
            'direct-booking.pilot_listing_ids' => ['pilot-one', 'pilot-two'],
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one']));

        $exitCode = Artisan::call('direct-booking:check-readiness', ['--json' => true]);
        $output = Artisan::output();
        $result = json_decode($output, true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(1, $exitCode);
        $this->assertFalse($result['checks']['MERCADO_PAGO_ACCESS_TOKEN']['configured']);
        $this->assertFalse($result['checks']['MERCADO_PAGO_WEBHOOK_QUEUE_CONNECTION']['configured']);
        $this->assertFalse($result['checks']['STAYS_BASE_URL']['configured']);
        $this->assertFalse($result['checks']['DIRECT_BOOKING_PILOT_LISTING_IDS']['configured']);
        $this->assertStringNotContainsString('sentinel-secret', $output);
        Http::assertNothingSent();
    }

    public function test_cielo_requires_its_credentials_instead_of_mercado_pago_credentials(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'direct-booking.payment_provider' => 'cielo_sandbox',
            'services.mercadopago.access_token' => null,
            'services.cielo.merchant_id' => 'sentinel-merchant',
            'services.cielo.merchant_key' => 'sentinel-key',
            'services.cielo.sop_client_id' => 'sentinel-client',
            'services.cielo.sop_client_secret' => 'sentinel-secret',
            'services.cielo.webhook_queue_connection' => 'database',
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $this->assertSame(0, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $output = Artisan::output();
        $result = json_decode($output, true, flags: JSON_THROW_ON_ERROR);
        $this->assertArrayNotHasKey('MERCADO_PAGO_ACCESS_TOKEN', $result['checks']);
        $this->assertStringNotContainsString('sentinel-', $output);

        config(['services.cielo.sop_client_secret' => null]);
        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertFalse($result['checks']['CIELO_SANDBOX_SOP_CLIENT_SECRET']['configured']);
        Http::assertNothingSent();
    }

    public function test_unknown_provider_fails_without_falling_back_to_mercado_pago(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config(['direct-booking.payment_provider' => 'unsupported']);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertFalse($result['checks']['DIRECT_BOOKING_PAYMENT_PROVIDER']['configured']);
        $this->assertArrayNotHasKey('MERCADO_PAGO_ACCESS_TOKEN', $result['checks']);
        Http::assertNothingSent();
    }

    public function test_production_diagnostic_requires_sop_and_never_allows_ticket_preview(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        $this->app->instance('env', 'production');
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));
        config([
            'direct-booking.payment_provider' => 'cielo',
            'services.cielo.direct_environment' => 'production',
            'services.cielo.production.enabled' => true,
            'services.cielo.production.sop_enabled' => false,
            'services.cielo.production.pix_enabled' => true,
            'services.cielo.production.pix_qr_expiration_seconds' => 1800,
            'services.cielo.production.merchant_id' => 'sentinel-merchant',
            'services.cielo.production.merchant_key' => 'sentinel-key',
            'services.cielo.production.sop_client_id' => 'sentinel-client',
            'services.cielo.production.sop_client_secret' => 'sentinel-secret',
            'services.cielo.production.webhook_header_name' => 'x-cielo-secret',
            'services.cielo.production.webhook_header_value' => 'sentinel-webhook-secret',
            'park-tickets.preview_enabled' => true,
        ]);
        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertFalse($result['checks']['CIELO_DIRECT_PRODUCTION_SOP_ENABLED']['configured']);
        $this->assertFalse($result['flags']['PARK_TICKETS_PREVIEW_ENABLED']['enabled']);
        $this->assertFalse($result['flags']['DIRECT_BOOKING_CHECKOUT_UI_ENABLED']['enabled']);
        config(['services.cielo.production.sop_enabled' => true]);
        $this->assertSame(0, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $this->assertStringNotContainsString('sentinel-', Artisan::output());
        Http::assertNothingSent();
    }

    private function configureCompleteReadiness(): void
    {
        config([
            'direct-booking.payment_provider' => 'mercadopago',
            'services.mercadopago.access_token' => 'sentinel-access-token',
            'services.mercadopago.webhook_secret' => 'sentinel-webhook-secret',
            'services.mercadopago.public_key' => 'sentinel-public-key',
            'services.mercadopago.webhook_queue_connection' => 'database',
            'services.stays.client_id' => 'sentinel-stays-id',
            'services.stays.client_secret' => 'sentinel-stays-secret',
            'services.stays.base_url' => 'https://stays.example.test/external/v1',
            'direct-booking.pilot_listing_ids' => ['pilot-one', 'pilot-two'],
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'provider-id',
            'direct-booking.reservation_hold_minutes' => 90,
            'direct-booking.notification_queue_connection' => 'database',
            'direct-booking.enabled' => false,
            'direct-booking.payments_enabled' => false,
            'direct-booking.confirmation_enabled' => false,
            'direct-booking.live_payments_enabled' => false,
            'queue.default' => 'database',
            'queue.connections.database' => ['driver' => 'database'],
            'mail.default' => 'smtp',
            'mail.mailers.smtp' => ['transport' => 'smtp'],
        ]);
    }

    /** @param list<string> $listingIds */
    private function registry(array $listingIds): DirectSaleTermsRegistry
    {
        $listings = array_map(fn (string $listingId): array => [
            'id' => $listingId,
            'directSaleTermsVersion' => 'terms-1',
            'directSaleTermsSnapshot' => [
                'version' => 'terms-1',
                'Preço e taxas' => 'Preço e taxas descritos.',
                'Cancelamento e reembolso' => 'Condições descritas.',
                'Forma e prazo de pagamento' => 'Condições descritas.',
                'Prazo da pré-reserva' => 'Prazo descrito.',
                'Atendimento e suporte' => 'Contato descrito.',
            ],
        ], $listingIds);

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
