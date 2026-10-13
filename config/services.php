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
        'timeout' => (int) env('STAYS_TIMEOUT', 10),
    ],

    'mercadopago' => [
        'public_key' => env('VITE_MERCADO_PAGO_PUBLIC_KEY'),
        'access_token' => env('MERCADO_PAGO_ACCESS_TOKEN'),
        'webhook_secret' => env('MERCADO_PAGO_WEBHOOK_SECRET'),
        'webhook_queue_connection' => env('MERCADO_PAGO_WEBHOOK_QUEUE_CONNECTION', 'database'),
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
