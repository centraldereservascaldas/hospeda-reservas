<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'stays' => [
        'base_url' => env('STAYS_BASE_URL', 'https://crcn.stays.net/external/v1'),
        'client_id' => env('STAYS_CLIENT_ID'),
        'client_secret' => env('STAYS_CLIENT_SECRET'),
        'hosted_checkout_enabled' => (bool) env('STAYS_HOSTED_CHECKOUT_ENABLED', false),
        'hosted_checkout_allowed_hosts' => array_values(array_filter(array_map(
            static fn (string $host): string => strtolower(trim($host)),
            explode(',', (string) env(
                'STAYS_HOSTED_CHECKOUT_ALLOWED_HOSTS',
                'www.centraldereservascaldas.com.br,centraldereservascaldas.com.br',
            )),
        ))),
        'timeout' => (int) env('STAYS_TIMEOUT', 10),
    ],

    'stays_simulator' => [
        'enabled' => (bool) env('STAYS_SIMULATOR_ENABLED', false),
    ],

    'mercadopago' => [
        'public_key' => env('VITE_MERCADO_PAGO_PUBLIC_KEY'),
        'access_token' => env('MERCADO_PAGO_ACCESS_TOKEN'),
        'webhook_secret' => env('MERCADO_PAGO_WEBHOOK_SECRET'),
        'webhook_queue_connection' => env('MERCADO_PAGO_WEBHOOK_QUEUE_CONNECTION', 'database'),
    ],

    'cielo' => [
        'direct_environment' => env('CIELO_DIRECT_ENVIRONMENT', 'sandbox'),
        'production' => [
            'enabled' => (bool) env('CIELO_DIRECT_PRODUCTION_ENABLED', false),
            'sop_enabled' => (bool) env('CIELO_DIRECT_PRODUCTION_SOP_ENABLED', false),
            'pix_enabled' => (bool) env('CIELO_DIRECT_PRODUCTION_PIX_ENABLED', false),
            'pix_qr_expiration_seconds' => (int) env('CIELO_DIRECT_PRODUCTION_PIX_EXPIRATION_SECONDS', 1800),
            'merchant_id' => env('CIELO_DIRECT_PRODUCTION_MERCHANT_ID') ?: env('CIELO_MERCHANT_ID'),
            'merchant_key' => env('CIELO_DIRECT_PRODUCTION_MERCHANT_KEY') ?: env('CIELO_MERCHANT_KEY'),
            'sop_client_id' => env('CIELO_DIRECT_PRODUCTION_SOP_CLIENT_ID') ?: env('CIELO_SOP_CLIENT_ID'),
            'sop_client_secret' => env('CIELO_DIRECT_PRODUCTION_SOP_CLIENT_SECRET') ?: env('CIELO_SOP_CLIENT_SECRET'),
            'webhook_header_name' => env('CIELO_DIRECT_PRODUCTION_WEBHOOK_HEADER_NAME'),
            'webhook_header_value' => env('CIELO_DIRECT_PRODUCTION_WEBHOOK_HEADER_VALUE'),
            'notification_mode' => env('CIELO_DIRECT_PRODUCTION_NOTIFICATION_MODE', 'webhook'),
            'webhook_queue_connection' => env('CIELO_DIRECT_PRODUCTION_WEBHOOK_QUEUE_CONNECTION', 'database'),
        ],
        'enabled' => (bool) env('CIELO_SANDBOX_ENABLED', false),
        'sop_enabled' => (bool) env('CIELO_SANDBOX_SOP_ENABLED', false),
        'pix_enabled' => (bool) env('CIELO_SANDBOX_PIX_ENABLED', false),
        'pix_qr_expiration_seconds' => (int) env('CIELO_SANDBOX_PIX_EXPIRATION_SECONDS', 1800),
        'merchant_id' => env('CIELO_SANDBOX_MERCHANT_ID'),
        'merchant_key' => env('CIELO_SANDBOX_MERCHANT_KEY'),
        'sop_client_id' => env('CIELO_SANDBOX_SOP_CLIENT_ID'),
        'sop_client_secret' => env('CIELO_SANDBOX_SOP_CLIENT_SECRET'),
        'webhook_header_name' => env('CIELO_SANDBOX_WEBHOOK_HEADER_NAME'),
        'webhook_header_value' => env('CIELO_SANDBOX_WEBHOOK_HEADER_VALUE'),
        'webhook_queue_connection' => env('CIELO_SANDBOX_WEBHOOK_QUEUE_CONNECTION', 'database'),
        'checkout_environment' => env('CIELO_ENVIRONMENT', 'sandbox'),
        'checkout_merchant_id' => env('CIELO_MERCHANT_ID'),
        'checkout_merchant_key' => env('CIELO_MERCHANT_KEY'),
        'checkout_sop_client_id' => env('CIELO_SOP_CLIENT_ID'),
        'checkout_sop_client_secret' => env('CIELO_SOP_CLIENT_SECRET'),
        'checkout_transaction_base_url' => env('CIELO_ENVIRONMENT', 'sandbox') === 'production'
            ? 'https://api.cieloecommerce.cielo.com.br'
            : 'https://apisandbox.cieloecommerce.cielo.com.br',
        'checkout_query_base_url' => env('CIELO_ENVIRONMENT', 'sandbox') === 'production'
            ? 'https://apiquery.cieloecommerce.cielo.com.br'
            : 'https://apiquerysandbox.cieloecommerce.cielo.com.br',
    ],

    'supabase' => [
        'url' => env('SUPABASE_URL', env('VITE_SUPABASE_URL')),
        'anon_key' => env('SUPABASE_ANON_KEY', env('VITE_SUPABASE_ANON_KEY')),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        'timeout' => (int) env('SUPABASE_TIMEOUT', 5),
    ],

    'openai' => [
        'api_key' => env('OPENAI_API_KEY'),
        'model' => env('OPENAI_MODEL', 'gpt-4.1-mini'),
    ],

    'hospeda' => [
        'owner_admin_emails' => array_values(array_filter(array_map(
            static fn (string $email): string => mb_strtolower(trim($email)),
            explode(',', (string) env('OWNER_ADMIN_EMAILS', '')),
        ))),
    ],

];
