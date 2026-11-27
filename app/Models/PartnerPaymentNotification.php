<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartnerPaymentNotification extends Model
{
    use HasUuids;

    protected $fillable = [
        'event_key', 'partner_checkout_order_id', 'partner_payment_attempt_id', 'gateway_provider',
        'gateway_payment_id', 'change_type', 'request_id', 'status', 'error_code',
        'reconciliation_attempts', 'received_at', 'processed_at',
    ];

    protected $hidden = ['event_key', 'gateway_payment_id', 'request_id'];

    protected function casts(): array
    {
        return [
            'change_type' => 'integer',
            'reconciliation_attempts' => 'integer',
            'received_at' => 'immutable_datetime',
            'processed_at' => 'immutable_datetime',
        ];
    }

    public function partnerCheckoutOrder(): BelongsTo
    {
        return $this->belongsTo(PartnerCheckoutOrder::class);
    }

    public function paymentAttempt(): BelongsTo
    {
        return $this->belongsTo(PartnerPaymentAttempt::class, 'partner_payment_attempt_id');
    }
}
