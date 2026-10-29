<?php

namespace App\Console\Commands;

use App\Models\DirectBookingOrder;
use App\Services\DirectSaleTermsRegistry;
use App\Services\Payments\CieloDirectConfiguration;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('direct-booking:check-readiness {--json : Exibe o resultado em JSON}')]
#[Description('Verifica a presença de pré-requisitos configurados para venda direta sem iniciar integrações.')]
class CheckDirectBookingReadiness extends Command
{
    private const SUPPORTED_QUEUE_DRIVERS = [
        'database', 'beanstalkd', 'sqs', 'redis', 'deferred', 'background', 'failover',
    ];

    private const SUPPORTED_MAIL_TRANSPORTS = [
        'smtp', 'sendmail', 'mailgun', 'ses', 'ses-v2', 'postmark', 'resend', 'failover', 'roundrobin',
    ];

    public function handle(DirectSaleTermsRegistry $termsRegistry): int
    {
        $pilotListingIds = config('direct-booking.pilot_listing_ids');
        $pilotTermsAreConfigured = $this->pilotTermsAreConfigured($pilotListingIds, $termsRegistry);
        $holdMinutes = filter_var(config('direct-booking.reservation_hold_minutes'), FILTER_VALIDATE_INT);
        $minimumPixMinutes = filter_var(config('direct-booking.pix_minimum_remaining_minutes', 30), FILTER_VALIDATE_INT);
        $safetyMarginMinutes = filter_var(config('direct-booking.payment_safety_margin_minutes', 5), FILTER_VALIDATE_INT);
        $checks = [
            ...$this->paymentProviderChecks(),
            'DIRECT_BOOKING_NOTIFICATION_QUEUE_CONNECTION' => $this->isQueueReady(config('direct-booking.notification_queue_connection')),
            'QUEUE_CONNECTION' => $this->isQueueReady(config('queue.default')),
            'DIRECT_BOOKING_PILOT_LISTING_IDS' => $pilotTermsAreConfigured,
            'STAYS_CLIENT_ID' => $this->isConfiguredString(config('services.stays.client_id')),
            'STAYS_CLIENT_SECRET' => $this->isConfiguredString(config('services.stays.client_secret')),
            'STAYS_BASE_URL' => $this->isValidUrl(config('services.stays.base_url')),
            'DIRECT_BOOKING_STAYS_PAYMENT_TYPE' => in_array(config('direct-booking.stays_payment_type'), ['credit', 'debit'], true),
            'DIRECT_BOOKING_STAYS_PAYMENT_PROVIDER_ID' => $this->isConfiguredString(config('direct-booking.stays_payment_provider_id')),
            'DIRECT_BOOKING_RESERVATION_HOLD_MINUTES' => $holdMinutes !== false
                && $holdMinutes >= 1
                && $holdMinutes <= 1440
                && $minimumPixMinutes !== false
                && $minimumPixMinutes >= 0
                && $safetyMarginMinutes !== false
                && $safetyMarginMinutes >= 0
                && $holdMinutes > $minimumPixMinutes + $safetyMarginMinutes,
            'DIRECT_BOOKING_RESUME_TOKEN_TTL_DAYS' => DirectBookingOrder::resumeTokenTtlDays() !== null,
            'MAIL_MAILER' => $this->hasExternalMailTransport(),
        ];
        $optionalChecks = config('direct-booking.payment_provider', 'mercadopago') === 'mercadopago'
            ? ['VITE_MERCADO_PAGO_PUBLIC_KEY' => $this->isConfiguredString(config('services.mercadopago.public_key'))]
            : [];
        $flags = [
            'DIRECT_BOOKING_CHECKOUT_UI_ENABLED' => (bool) config('direct-booking.checkout_ui_enabled', false),
            'PARK_TICKETS_PREVIEW_ENABLED' => app()->environment(['local', 'testing'])
                && (bool) config('park-tickets.preview_enabled', false),
            'DIRECT_BOOKING_ENABLED' => (bool) config('direct-booking.enabled', false),
            'DIRECT_BOOKING_PAYMENTS_ENABLED' => (bool) config('direct-booking.payments_enabled', false),
            'DIRECT_BOOKING_CONFIRMATION_ENABLED' => (bool) config('direct-booking.confirmation_enabled', false),
            'DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED' => (bool) config('direct-booking.live_payments_enabled', false),
            'CIELO_SANDBOX_ENABLED' => (bool) config('services.cielo.enabled', false),
            'CIELO_SANDBOX_SOP_ENABLED' => (bool) config('services.cielo.sop_enabled', false),
        ];
        $complete = ! in_array(false, $checks, true);

        if ($this->option('json')) {
            $this->line(json_encode([
                'prerequisites_configured' => $complete,
                'checks' => array_map(static fn (bool $configured): array => ['configured' => $configured], $checks),
                'optional_checks' => array_map(static fn (bool $configured): array => ['configured' => $configured], $optionalChecks),
                'flags' => array_map(static fn (bool $enabled): array => ['enabled' => $enabled], $flags),
                'scope' => 'Presença e formato de configuração apenas; credenciais, sandbox, conectividade e operação não foram validados. Este resultado não declara prontidão para lançamento.',
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        } else {
            foreach ($checks as $name => $configured) {
                $this->line($name.': '.($configured ? 'configurado' : 'pendente'));
            }

            foreach ($optionalChecks as $name => $configured) {
                $this->line($name.' (opcional): '.($configured ? 'configurado' : 'pendente'));
            }

            foreach ($flags as $name => $enabled) {
                $this->line($name.': '.($enabled ? 'habilitado' : 'desabilitado'));
            }

            $this->line('Flags são informativas e não são exigidas para este diagnóstico. Valores presentes não validam credenciais, sandbox, conectividade ou operação.');
            $this->line('Pré-requisitos configurados: '.($complete ? 'sim' : 'não').'. Isso não declara prontidão para lançamento.');
        }

        return $complete ? self::SUCCESS : self::FAILURE;
    }

    /** @return array<string, bool> */
    private function paymentProviderChecks(): array
    {
        $provider = config('direct-booking.payment_provider', 'mercadopago');
        $checks = ['DIRECT_BOOKING_PAYMENT_PROVIDER' => in_array($provider, ['mercadopago', 'cielo_sandbox', 'cielo', 'cielo_checkout'], true)];

        if ($provider === 'mercadopago') {
            return $checks + [
                'MERCADO_PAGO_ACCESS_TOKEN' => $this->isConfiguredString(config('services.mercadopago.access_token')),
                'MERCADO_PAGO_WEBHOOK_SECRET' => $this->isConfiguredString(config('services.mercadopago.webhook_secret')),
                'MERCADO_PAGO_WEBHOOK_QUEUE_CONNECTION' => $this->isQueueReady(config('services.mercadopago.webhook_queue_connection')),
            ];
        }

        if (CieloDirectConfiguration::isProvider($provider)) {
            if ($provider === 'cielo') {
                $configuration = app(CieloDirectConfiguration::class);

                return $checks + [
                    'CIELO_DIRECT_ENVIRONMENT' => $configuration->environment() === 'production',
                    'CIELO_DIRECT_PRODUCTION_ENABLED' => $configuration->isAllowed(),
                    'CIELO_DIRECT_PRODUCTION_SOP_ENABLED' => (bool) $configuration->value('sop_enabled'),
                    'CIELO_DIRECT_PRODUCTION_PIX_ENABLED' => (bool) $configuration->value('pix_enabled'),
                    'CIELO_DIRECT_PRODUCTION_PIX_EXPIRATION_SECONDS' => $this->isValidPixExpiration($configuration->value('pix_qr_expiration_seconds')),
                    'CIELO_DIRECT_PRODUCTION_MERCHANT_ID' => $this->isConfiguredString($configuration->value('merchant_id')),
                    'CIELO_DIRECT_PRODUCTION_MERCHANT_KEY' => $this->isConfiguredString($configuration->value('merchant_key')),
                    'CIELO_DIRECT_PRODUCTION_SOP_CLIENT_ID' => $this->isConfiguredString($configuration->value('sop_client_id')),
                    'CIELO_DIRECT_PRODUCTION_SOP_CLIENT_SECRET' => $this->isConfiguredString($configuration->value('sop_client_secret')),
                    'CIELO_DIRECT_PRODUCTION_WEBHOOK_HEADER_NAME' => $this->isConfiguredString($configuration->value('webhook_header_name')),
                    'CIELO_DIRECT_PRODUCTION_WEBHOOK_HEADER_VALUE' => $this->isConfiguredString($configuration->value('webhook_header_value')),
                    'CIELO_DIRECT_PRODUCTION_WEBHOOK_QUEUE_CONNECTION' => $this->isQueueReady($configuration->value('webhook_queue_connection')),
                ];
            }

            return $checks + [
                'CIELO_SANDBOX_MERCHANT_ID' => $this->isConfiguredString(config('services.cielo.merchant_id')),
                'CIELO_SANDBOX_MERCHANT_KEY' => $this->isConfiguredString(config('services.cielo.merchant_key')),
                'CIELO_SANDBOX_SOP_CLIENT_ID' => $this->isConfiguredString(config('services.cielo.sop_client_id')),
                'CIELO_SANDBOX_SOP_CLIENT_SECRET' => $this->isConfiguredString(config('services.cielo.sop_client_secret')),
                'CIELO_SANDBOX_WEBHOOK_QUEUE_CONNECTION' => $this->isQueueReady(config('services.cielo.webhook_queue_connection')),
            ];
        }

        if ($provider === 'cielo_checkout') {
            return $checks + [
                'CIELO_MERCHANT_ID' => $this->isConfiguredString(config('services.cielo.checkout_merchant_id')),
                'CIELO_SOP_CLIENT_ID' => $this->isConfiguredString(config('services.cielo.checkout_sop_client_id')),
                'CIELO_SOP_CLIENT_SECRET' => $this->isConfiguredString(config('services.cielo.checkout_sop_client_secret')),
                'CIELO_ENVIRONMENT' => in_array(config('services.cielo.checkout_environment'), ['sandbox', 'production'], true),
            ];
        }

        return $checks;
    }

    private function isValidPixExpiration(mixed $value): bool
    {
        $seconds = filter_var($value, FILTER_VALIDATE_INT);

        return $seconds !== false && $seconds >= 60 && $seconds <= 86400;
    }

    private function isConfiguredString(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }

    private function isValidUrl(mixed $value): bool
    {
        if (! $this->isConfiguredString($value) || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $urlParts = parse_url($value);

        return is_array($urlParts)
            && strtolower((string) ($urlParts['scheme'] ?? '')) === 'https'
            && $this->isConfiguredString($urlParts['host'] ?? null);
    }

    private function isQueueReady(mixed $connectionName): bool
    {
        if (! $this->isConfiguredString($connectionName) || $connectionName === 'sync') {
            return false;
        }

        $connection = config('queue.connections.'.$connectionName);
        $driver = is_array($connection) ? ($connection['driver'] ?? null) : null;

        return is_string($driver) && in_array($driver, self::SUPPORTED_QUEUE_DRIVERS, true);
    }

    private function hasExternalMailTransport(mixed $mailerName = null, array $visitedMailers = []): bool
    {
        $mailerName ??= config('mail.default');
        if (! $this->isConfiguredString($mailerName) || in_array($mailerName, $visitedMailers, true)) {
            return false;
        }

        $mailer = config('mail.mailers.'.$mailerName);
        if (! is_array($mailer) || ! is_string($mailer['transport'] ?? null)) {
            return false;
        }

        $transport = $mailer['transport'];
        if (in_array($transport, ['log', 'array'], true)) {
            return false;
        }

        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            $fallbackMailers = $mailer['mailers'] ?? null;
            if (! is_array($fallbackMailers) || $fallbackMailers === []) {
                return false;
            }

            foreach ($fallbackMailers as $fallbackMailer) {
                if (! is_string($fallbackMailer)
                    || ! $this->hasExternalMailTransport($fallbackMailer, [...$visitedMailers, $mailerName])) {
                    return false;
                }
            }

            return true;
        }

        return in_array($transport, self::SUPPORTED_MAIL_TRANSPORTS, true);
    }

    private function pilotTermsAreConfigured(mixed $pilotListingIds, DirectSaleTermsRegistry $termsRegistry): bool
    {
        if (! is_array($pilotListingIds)
            || array_is_list($pilotListingIds) === false
            || count($pilotListingIds) < 2
            || count($pilotListingIds) > 5) {
            return false;
        }

        foreach ($pilotListingIds as $listingId) {
            if (! $this->isConfiguredString($listingId)) {
                return false;
            }
        }

        if (count(array_unique($pilotListingIds)) !== count($pilotListingIds)) {
            return false;
        }

        try {
            foreach ($pilotListingIds as $listingId) {
                if ($termsRegistry->findApprovedListing($listingId) === null) {
                    return false;
                }
            }
        } catch (Throwable) {
            return false;
        }

        return true;
    }
}
