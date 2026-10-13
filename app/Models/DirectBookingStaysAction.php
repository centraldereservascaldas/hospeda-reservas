<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DirectBookingStaysAction extends Model
{
    use HasUuids;

    protected $fillable = [
        'direct_booking_order_id',
        'action_type',
        'status',
        'idempotency_key',
        'request_snapshot',
        'response_snapshot',
        'external_id',
        'attempt_count',
        'last_attempt_at',
        'completed_at',
        'attention_required_at',
        'error_code',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'request_snapshot' => 'array',
            'response_snapshot' => 'array',
            'attempt_count' => 'integer',
            'last_attempt_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'attention_required_at' => 'immutable_datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(DirectBookingOrder::class, 'direct_booking_order_id');
    }
}
