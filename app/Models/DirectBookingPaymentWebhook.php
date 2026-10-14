<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DirectBookingPaymentWebhook extends Model
{
    use HasUuids;

    protected $fillable = [
        'event_key',
        'gateway_payment_id',
        'request_id',
        'status',
        'error_code',
        'received_at',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'received_at' => 'immutable_datetime',
            'processed_at' => 'immutable_datetime',
            'reconciliation_attempts' => 'integer',
        ];
    }
}
