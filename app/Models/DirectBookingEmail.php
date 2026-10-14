<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DirectBookingEmail extends Model
{
    use HasUuids;

    public const TYPE_BOOKING_CONFIRMED = 'booking_confirmed';

    public const STALE_PENDING_MINUTES = 5;

    public const STALE_PROCESSING_MINUTES = 10;

    public const STALE_QUEUED_MINUTES = 5;

    public const RETRY_WINDOW_HOURS = 24;

    protected $fillable = [
        'direct_booking_order_id',
        'notification_type',
        'status',
        'attempts',
        'last_attempt_at',
        'queued_at',
        'next_attempt_at',
        'sent_at',
        'error_code',
    ];

    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'last_attempt_at' => 'immutable_datetime',
            'next_attempt_at' => 'immutable_datetime',
            'queued_at' => 'immutable_datetime',
            'sent_at' => 'immutable_datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(DirectBookingOrder::class, 'direct_booking_order_id');
    }
}
