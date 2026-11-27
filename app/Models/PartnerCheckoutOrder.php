<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PartnerCheckoutOrder extends Model
{
    use HasUuids;

    private ?string $previousStatus = null;

    protected $guarded = ['id'];

    protected $hidden = ['encrypted_customer', 'reservation_idempotency_key', 'submission_key_hash', 'submission_fingerprint', 'public_reference', 'payment_qr_code'];

    protected function casts(): array
    {
        return ['encrypted_customer' => 'encrypted:array', 'payment_qr_code' => 'encrypted', 'check_in' => 'date', 'check_out' => 'date'];
    }

    protected static function booted(): void
    {
        static::created(function (PartnerCheckoutOrder $order): void {
            $order->recordEvent('checkout_started', null, $order->status, null);
        });

        static::updating(function (PartnerCheckoutOrder $order): void {
            $order->previousStatus = $order->getOriginal('status');
        });

        static::updated(function (PartnerCheckoutOrder $order): void {
            if (! $order->wasChanged(['status', 'attention_reason'])) {
                return;
            }

            $order->recordEvent(
                $order->eventTypeForStatus((string) $order->status),
                $order->previousStatus,
                (string) $order->status,
                $order->attention_reason
            );
            $order->previousStatus = null;
        });
    }

    public function events(): HasMany
    {
        return $this->hasMany(PartnerCheckoutEvent::class)->orderBy('occurred_at')->orderBy('id');
    }

    public function paymentAttempts(): HasMany
    {
        return $this->hasMany(PartnerPaymentAttempt::class);
    }

    public function paymentNotifications(): HasMany
    {
        return $this->hasMany(PartnerPaymentNotification::class);
    }

    private function recordEvent(string $eventType, ?string $fromStatus, ?string $toStatus, ?string $attentionReason): void
    {
        PartnerCheckoutEvent::query()->create([
            'partner_checkout_order_id' => $this->id,
            'event_type' => $eventType,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'attention_reason' => $attentionReason,
            'source' => app()->runningInConsole() ? 'system' : 'request',
            'error_code' => $attentionReason,
            'metadata' => [
                'propertyId' => $this->supplier_property_id,
                'checkIn' => $this->check_in?->toDateString(),
                'checkOut' => $this->check_out?->toDateString(),
                'guests' => $this->guests,
                'baseCents' => $this->base_cents,
                'paymentCents' => $this->payment_cents,
                'currency' => $this->currency,
                'method' => $this->payment_method,
                'installments' => $this->installments,
                'paymentId' => $this->payment_id,
                'merchantOrderId' => $this->merchant_order_id,
                'reservationReference' => $this->reservation_reference,
                'supplierOperationId' => $this->supplier_operation_id,
                'supplierPayableObservedCents' => $this->supplier_payable_observed_cents,
                'supplierPaidCents' => $this->supplier_paid_cents,
                'supplierPaymentReference' => $this->supplier_payment_reference,
                'supplierPaidAt' => $this->supplier_paid_at?->toIso8601String(),
            ],
            'occurred_at' => now(),
        ]);
    }

    private function eventTypeForStatus(string $status): string
    {
        return match ($status) {
            'payment_starting' => 'payment_attempt_started',
            'payment_pending' => 'payment_attempt_created',
            'payment_verified' => 'payment_verified',
            'payment_rejected' => 'payment_rejected',
            'payment_cancelled' => 'payment_cancelled',
            'reservation_starting' => 'supplier_reservation_started',
            'awaiting_seller_payment' => 'supplier_reservation_created',
            'supplier_payment_recorded' => 'supplier_payment_recorded',
            'attention_required' => 'attention_required',
            'quote_unavailable' => 'quote_unavailable',
            default => 'checkout_status_changed',
        };
    }

    public function hasCurrentPixWindow(): bool
    {
        return $this->created_at !== null
            && $this->created_at->lessThanOrEqualTo(now())
            && $this->created_at->copy()->addSeconds(1800)->isFuture();
    }
}
