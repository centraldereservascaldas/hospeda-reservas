<?php

return [
    'enabled' => (bool) env('DIRECT_BOOKING_ENABLED', false),
    'payments_enabled' => (bool) env('DIRECT_BOOKING_PAYMENTS_ENABLED', false),
    'confirmation_enabled' => (bool) env('DIRECT_BOOKING_CONFIRMATION_ENABLED', false),
    'send_confirmation_email' => (bool) env('DIRECT_BOOKING_SEND_CONFIRMATION_EMAIL', false),
    'stays_payment_type' => env('DIRECT_BOOKING_STAYS_PAYMENT_TYPE'),
    'stays_payment_provider_id' => env('DIRECT_BOOKING_STAYS_PAYMENT_PROVIDER_ID'),
    'reservation_hold_minutes' => env('DIRECT_BOOKING_RESERVATION_HOLD_MINUTES'),
    'reservation_claim_timeout_seconds' => (int) env('DIRECT_BOOKING_RESERVATION_CLAIM_TIMEOUT_SECONDS', 60),
    'payment_reconciliation_interval_seconds' => (int) env('DIRECT_BOOKING_PAYMENT_RECONCILIATION_INTERVAL_SECONDS', 300),
    'pix_minimum_remaining_minutes' => (int) env('DIRECT_BOOKING_PIX_MINIMUM_REMAINING_MINUTES', 30),
    'payment_safety_margin_minutes' => (int) env('DIRECT_BOOKING_PAYMENT_SAFETY_MARGIN_MINUTES', 5),
    'notification_queue_connection' => env('DIRECT_BOOKING_NOTIFICATION_QUEUE_CONNECTION', 'database'),
];
