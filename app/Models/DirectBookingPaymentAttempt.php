<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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

    protected $hidden = [
        'idempotency_key',
        'request_fingerprint',
        'gateway_payment_id',
        'gateway_idempotency_key',
        'gateway_retry_payload',
        'pix_copy_paste',
        'pix_qr_code_base64',
    ];

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

    public function webhooks(): HasMany
    {
        return $this->hasMany(DirectBookingPaymentWebhook::class, 'gateway_payment_id', 'gateway_payment_id');
    }

    /** @return array{copyPaste: string|null, qrCodeBase64: string|null} */
    public function safePixInstructions(bool $orderAllowsPayment): array
    {
        $canShow = $orderAllowsPayment
            && config('direct-booking.enabled', false)
            && config('direct-booking.payments_enabled', false)
            && config('direct-booking.confirmation_enabled', false)
            && $this->payment_method === 'pix'
            && in_array($this->status, ['pending', 'in_process'], true)
            && $this->expires_at?->isFuture() === true;
        $qrCodeBase64 = $canShow ? $this->pix_qr_code_base64 : null;
        if (! is_string($qrCodeBase64)
            || strlen($qrCodeBase64) > 100_000
            || base64_decode($qrCodeBase64, true) === false) {
            $qrCodeBase64 = null;
        }

        $copyPaste = $canShow ? $this->pix_copy_paste : null;
        if (! is_string($copyPaste) || trim($copyPaste) === '' || mb_strlen($copyPaste) > 1_000) {
            $copyPaste = null;
        }

        return ['copyPaste' => $copyPaste, 'qrCodeBase64' => $qrCodeBase64];
    }
}
