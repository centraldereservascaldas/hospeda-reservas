<?php

namespace Tests\Feature;

use App\Services\DirectBookingCatalog;
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

    public function test_mail_defaults_do_not_pass_transactional_email_readiness(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.from.address' => 'hello@example.com',
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertFalse($result['checks']['MAIL_MAILER']['configured']);
        $this->assertFalse($result['checks']['MAIL_FROM_ADDRESS']['configured']);
        Http::assertNothingSent();
    }

    public function test_stays_managed_email_does_not_require_own_mail_transport(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'direct-booking.send_confirmation_email' => false,
            'mail.default' => 'log',
            'mail.from.address' => 'hello@example.com',
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $this->assertSame(0, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertArrayNotHasKey('MAIL_MAILER', $result['checks']);
        $this->assertArrayNotHasKey('MAIL_FROM_ADDRESS', $result['checks']);
        $this->assertFalse($result['flags']['DIRECT_BOOKING_SEND_CONFIRMATION_EMAIL']['enabled']);
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

    public function test_documented_sandbox_sop_credentials_require_their_matching_merchant(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'direct-booking.payment_provider' => 'cielo_sandbox',
            'services.cielo.direct_environment' => 'sandbox',
            'services.cielo.merchant_id' => 'another-sandbox-merchant',
            'services.cielo.merchant_key' => 'sandbox-key-fixture',
            'services.cielo.sop_client_id' => '6631016d-72e6-4db1-a2d2-9cbe61464925',
            'services.cielo.sop_client_secret' => 'sop-secret-fixture',
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));

        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertFalse($result['checks']['CIELO_SANDBOX_SOP_MERCHANT_COMPATIBLE']['configured']);

        config(['services.cielo.merchant_id' => '832ce400-9c97-4fe7-9d4f-0928675e36cd']);
        $this->assertSame(0, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
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

    public function test_production_credentials_are_not_reported_as_configured_from_sandbox_values(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'direct-booking.payment_provider' => 'cielo',
            'services.cielo.direct_environment' => 'sandbox',
            'services.cielo.merchant_id' => 'sentinel-sandbox-merchant',
            'services.cielo.merchant_key' => 'sentinel-sandbox-key',
            'services.cielo.sop_client_id' => 'sentinel-sandbox-client',
            'services.cielo.sop_client_secret' => 'sentinel-sandbox-secret',
            'services.cielo.production.merchant_id' => null,
            'services.cielo.production.merchant_key' => null,
            'services.cielo.production.sop_client_id' => null,
            'services.cielo.production.sop_client_secret' => null,
        ]);

        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $output = Artisan::output();
        $result = json_decode($output, true, flags: JSON_THROW_ON_ERROR);

        foreach (['MERCHANT_ID', 'MERCHANT_KEY', 'SOP_CLIENT_ID', 'SOP_CLIENT_SECRET'] as $key) {
            $this->assertFalse($result['checks']['CIELO_DIRECT_PRODUCTION_'.$key]['configured']);
        }
        $this->assertStringNotContainsString('sentinel-', $output);
        Http::assertNothingSent();
    }

    public function test_production_polling_mode_does_not_require_replacing_existing_cielo_webhook(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        $this->app->instance('env', 'production');
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['pilot-one', 'pilot-two']));
        config([
            'direct-booking.payment_provider' => 'cielo',
            'services.cielo.direct_environment' => 'production',
            'services.cielo.production.enabled' => true,
            'services.cielo.production.sop_enabled' => true,
            'services.cielo.production.pix_enabled' => true,
            'services.cielo.production.pix_qr_expiration_seconds' => 1800,
            'services.cielo.production.merchant_id' => 'sentinel-merchant',
            'services.cielo.production.merchant_key' => 'sentinel-key',
            'services.cielo.production.sop_client_id' => 'sentinel-client',
            'services.cielo.production.sop_client_secret' => 'sentinel-secret',
            'services.cielo.production.notification_mode' => 'polling',
            'services.cielo.production.webhook_header_name' => null,
            'services.cielo.production.webhook_header_value' => null,
            'direct-booking.payment_reconciliation_interval_seconds' => 300,
        ]);

        $this->assertSame(0, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertTrue($result['checks']['CIELO_DIRECT_PRODUCTION_NOTIFICATION_MODE']['configured']);
        $this->assertTrue($result['checks']['DIRECT_BOOKING_PAYMENT_RECONCILIATION_INTERVAL_SECONDS']['configured']);
        $this->assertArrayNotHasKey('CIELO_DIRECT_PRODUCTION_WEBHOOK_HEADER_VALUE', $result['checks']);
        Http::assertNothingSent();

        config(['direct-booking.payment_reconciliation_interval_seconds' => 900]);
        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertFalse($result['checks']['DIRECT_BOOKING_PAYMENT_RECONCILIATION_INTERVAL_SECONDS']['configured']);
    }

    public function test_general_rollout_reports_catalog_terms_without_requiring_pilot_ids(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config([
            'direct-booking.rollout_mode' => 'all_approved',
            'direct-booking.pilot_listing_ids' => [],
            'direct-booking.catalog_source' => 'stays',
            'direct-booking.stays_terms_enabled' => true,
        ]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['approved-listing']));

        $this->assertSame(0, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertTrue($result['checks']['DIRECT_BOOKING_APPROVED_LISTINGS']['configured']);
        $this->assertArrayNotHasKey('DIRECT_BOOKING_PILOT_LISTING_IDS', $result['checks']);
        $this->assertFalse($result['flags']['DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED']['enabled']);
        Http::assertNothingSent();
    }

    public function test_general_rollout_rejects_static_catalog_and_terms(): void
    {
        Http::preventStrayRequests();
        $this->configureCompleteReadiness();
        config(['direct-booking.rollout_mode' => 'all_approved', 'direct-booking.pilot_listing_ids' => []]);
        $this->app->instance(DirectSaleTermsRegistry::class, $this->registry(['approved-listing']));

        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $result = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertTrue($result['checks']['DIRECT_BOOKING_APPROVED_LISTINGS']['configured']);
        $this->assertFalse($result['checks']['DIRECT_BOOKING_CATALOG_SOURCE']['configured']);
        $this->assertFalse($result['checks']['DIRECT_BOOKING_STAYS_TERMS_ENABLED']['configured']);
        Http::assertNothingSent();
    }

    public function test_unavailable_live_catalog_is_reported_as_pending_without_exposing_external_errors(): void
    {
        $this->configureCompleteReadiness();
        config([
            'direct-booking.rollout_mode' => 'all_approved',
            'direct-booking.catalog_source' => 'stays',
            'cache.default' => 'array',
        ]);
        Http::preventStrayRequests();
        Http::fake(['https://stays.example.test/external/v1/content/listings*' => Http::response(['error' => 'sentinel-upstream-error'], 503)]);

        $this->assertSame(1, Artisan::call('direct-booking:check-readiness', ['--json' => true]));
        $output = Artisan::output();
        $result = json_decode($output, true, flags: JSON_THROW_ON_ERROR);

        $this->assertFalse($result['checks']['DIRECT_BOOKING_APPROVED_LISTINGS']['configured']);
        $this->assertStringNotContainsString('sentinel-upstream-error', $output);
        Http::assertSentCount(1);
    }

    private function configureCompleteReadiness(): void
    {
        config([
            'direct-booking.payment_provider' => 'mercadopago',
            'direct-booking.checkout_ui_enabled' => false,
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
            'direct-booking.send_confirmation_email' => true,
            'queue.default' => 'database',
            'queue.connections.database' => ['driver' => 'database'],
            'mail.default' => 'smtp',
            'mail.mailers.smtp' => ['transport' => 'smtp', 'host' => 'smtp.example.test', 'port' => 587],
            'mail.from.address' => 'reservas@caldas.example.test',
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
            public function __construct(private readonly array $listings)
            {
                parent::__construct(new class extends DirectBookingCatalog
                {
                    public function __construct() {}

                    public function withTerms(array $listing): array
                    {
                        return $listing;
                    }
                });
            }

            protected function catalog(): array
            {
                return $this->listings;
            }
        };
    }
}
