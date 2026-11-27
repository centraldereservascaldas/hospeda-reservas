<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PartnerCheckoutEvent extends Model
{
    protected $fillable = [
        'partner_checkout_order_id',
        'event_type',
        'from_status',
        'to_status',
        'attention_reason',
        'source',
        'provider_status',
        'error_code',
        'metadata',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'occurred_at' => 'immutable_datetime'];
    }
}
