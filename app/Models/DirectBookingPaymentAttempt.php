<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DirectBookingPaymentAttempt extends Model
{
    use HasUuids;

    protected $fillable = [
        'direct_booking_order_id',
        'idempotency_key',
        'request_fingerprint',
        'gateway_payment_id',
        'gateway_idempotency_key',
        'payment_method',
        'payment_method_id',
        'installments',
        'status',
        'gateway_status',
        'gateway_status_detail',
        'payment_method_detail',
        'amount',
        'currency',
        'expires_at',
        'paid_at',
        'gateway_updated_at',
        'pix_copy_paste',
        'pix_qr_code_base64',
        'error_code',
        'gateway_submission_started_at',
        'gateway_submission_count',
        'gateway_retry_payload',
    ];

    protected $hidden = ['idempotency_key', 'request_fingerprint', 'gateway_idempotency_key', 'gateway_retry_payload'];

    protected function casts(): array
    {
        return [
            'installments' => 'integer',
            'amount' => 'decimal:2',
            'expires_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime',
            'gateway_updated_at' => 'immutable_datetime',
            'gateway_submission_started_at' => 'immutable_datetime',
            'gateway_submission_count' => 'integer',
            'gateway_retry_payload' => 'encrypted:array',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(DirectBookingOrder::class, 'direct_booking_order_id');
    }
}
