<?php

return [
    'enabled' => (bool) env('DIRECT_BOOKING_ENABLED', false),
    'payments_enabled' => (bool) env('DIRECT_BOOKING_PAYMENTS_ENABLED', false),
    'reservation_hold_minutes' => env('DIRECT_BOOKING_RESERVATION_HOLD_MINUTES'),
    'reservation_claim_timeout_seconds' => (int) env('DIRECT_BOOKING_RESERVATION_CLAIM_TIMEOUT_SECONDS', 60),
    'pix_minimum_remaining_minutes' => (int) env('DIRECT_BOOKING_PIX_MINIMUM_REMAINING_MINUTES', 30),
    'payment_safety_margin_minutes' => (int) env('DIRECT_BOOKING_PAYMENT_SAFETY_MARGIN_MINUTES', 5),
];
