<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartnerPaymentAttempt extends Model
{
    use HasUuids;

    protected $fillable = [
        'partner_checkout_order_id', 'supplier_property_id', 'gateway_provider', 'merchant_order_id', 'gateway_payment_id',
        'payment_method', 'installments', 'amount_cents', 'currency', 'status', 'provider_status',
        'provider_status_detail', 'error_code', 'submitted_at', 'paid_at', 'expires_at', 'provider_updated_at',
    ];

    protected $hidden = ['gateway_payment_id', 'merchant_order_id'];

    protected function casts(): array
    {
        return [
            'installments' => 'integer',
            'amount_cents' => 'integer',
            'submitted_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'provider_updated_at' => 'immutable_datetime',
        ];
    }

    public function partnerCheckoutOrder(): BelongsTo
    {
        return $this->belongsTo(PartnerCheckoutOrder::class);
    }
}
