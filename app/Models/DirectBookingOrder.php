<?php

namespace App\Models;

use App\Enums\DirectBookingOrderStatus;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DirectBookingOrder extends Model
{
    use HasUuids;

    protected $fillable = [
        'status',
        'idempotency_key',
        'public_reference',
        'resume_token',
        'request_fingerprint',
        'listing_id',
        'stays_listing_id',
        'stays_client_id',
        'reservation_status',
        'check_in',
        'check_out',
        'guests',
        'guest_name',
        'guest_email',
        'guest_phone',
        'quote_total',
        'currency',
        'quote_snapshot',
        'accepted_terms_version',
        'accepted_terms_snapshot',
        'terms_accepted_at',
        'origin',
        'expires_at',
        'stays_reservation_id',
        'gateway_payment_id',
        'payment_status',
        'payment_amount',
        'payment_currency',
        'payment_method',
        'payment_detail',
        'payment_status_detail',
        'payment_expires_at',
        'paid_at',
        'payment_qr_code',
        'operational_events',
    ];

    protected $hidden = [
        'idempotency_key',
        'request_fingerprint',
        'resume_token',
        'payment_qr_code',
    ];

    protected function casts(): array
    {
        return [
            'status' => DirectBookingOrderStatus::class,
            'check_in' => 'date',
            'check_out' => 'date',
            'guests' => 'array',
            'quote_total' => 'decimal:2',
            'quote_snapshot' => 'array',
            'accepted_terms_snapshot' => 'array',
            'terms_accepted_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'payment_expires_at' => 'immutable_datetime',
            'paid_at' => 'immutable_datetime',
            'resume_token' => 'encrypted',
            'operational_events' => 'array',
        ];
    }

    public function transitionTo(DirectBookingOrderStatus $status, array $event = []): void
    {
        $transitions = [
            DirectBookingOrderStatus::Iniciado->value => [DirectBookingOrderStatus::Cotado, DirectBookingOrderStatus::AtencaoOperacional],
            DirectBookingOrderStatus::Cotado->value => [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::Expirado, DirectBookingOrderStatus::AtencaoOperacional],
            DirectBookingOrderStatus::PreReservado->value => [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::LiberacaoPendente, DirectBookingOrderStatus::Expirado, DirectBookingOrderStatus::PagamentoRecusado, DirectBookingOrderStatus::AtencaoOperacional],
            DirectBookingOrderStatus::LiberacaoPendente->value => [DirectBookingOrderStatus::Expirado, DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::PagamentoPendente->value => [DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::Expirado, DirectBookingOrderStatus::PagamentoRecusado, DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::PagoEmConfirmacao->value => [DirectBookingOrderStatus::Confirmado, DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::Confirmado->value => [DirectBookingOrderStatus::Concluido, DirectBookingOrderStatus::CancelamentoSolicitado, DirectBookingOrderStatus::Contestado, DirectBookingOrderStatus::AtencaoOperacional],
            DirectBookingOrderStatus::CancelamentoSolicitado->value => [DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::ReembolsoPendente->value => [DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::AtencaoOperacional->value => [DirectBookingOrderStatus::PreReservado, DirectBookingOrderStatus::LiberacaoPendente, DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::PagamentoRecusado, DirectBookingOrderStatus::PagoEmConfirmacao, DirectBookingOrderStatus::Confirmado, DirectBookingOrderStatus::Expirado, DirectBookingOrderStatus::ReembolsoPendente, DirectBookingOrderStatus::Reembolsado, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::Expirado->value => [DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::PagamentoRecusado->value => [DirectBookingOrderStatus::PagamentoPendente, DirectBookingOrderStatus::LiberacaoPendente, DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::Concluido->value => [DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::Reembolsado->value => [DirectBookingOrderStatus::Contestado],
            DirectBookingOrderStatus::Contestado->value => [DirectBookingOrderStatus::AtencaoOperacional, DirectBookingOrderStatus::ReembolsoPendente],
        ];

        if (! in_array($status, $transitions[$this->status->value] ?? [], true)) {
            throw new \InvalidArgumentException("Transição inválida de {$this->status->value} para {$status->value}.");
        }

        $this->status = $status;
        $events = $this->operational_events ?? [];
        $events[] = [...$event, 'status' => $status->value, 'at' => now()->toISOString()];
        $this->operational_events = $events;
    }

    public function paymentAttempts(): HasMany
    {
        return $this->hasMany(DirectBookingPaymentAttempt::class, 'direct_booking_order_id');
    }

    public function staysActions(): HasMany
    {
        return $this->hasMany(DirectBookingStaysAction::class, 'direct_booking_order_id');
    }

    public function confirmationEmails(): HasMany
    {
        return $this->hasMany(DirectBookingEmail::class, 'direct_booking_order_id');
    }
}
