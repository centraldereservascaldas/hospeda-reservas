<?php

namespace Tests\Unit;

use App\Services\ExistingReservationBalance;
use App\Services\ExistingReservationPaymentGuard;
use PHPUnit\Framework\TestCase;

class ExistingReservationPaymentGuardTest extends TestCase
{
    public function test_reservation_and_pending_payment_must_remain_unchanged(): void
    {
        $reservation = ['_id' => 'r', '_idclient' => 'c', '_idlisting' => 'l', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'type' => 'booked', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 395]];
        $payment = ['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $snapshot = ['_id' => 'r', '_idclient' => 'c', '_idlisting' => 'l', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750, 'reported_paid_present' => false, 'reported_paid_cents' => null, 'payment_id' => str_repeat('a', 24), 'pending_provider_id' => str_repeat('f', 24)];
        $guard = new ExistingReservationPaymentGuard(new ExistingReservationBalance);

        $this->assertTrue($guard->matches($reservation, [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['_idclient' => 'different']), [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['checkOutDate' => '2026-11-17']), [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['guests' => 5]), [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['type' => 'canceled']), [$payment], $snapshot));
        $this->assertFalse($guard->matches($reservation, [array_replace($payment, ['status' => 'completed'])], $snapshot));
        $this->assertFalse($guard->matches($reservation, [array_replace($payment, ['_f_val' => 100])], $snapshot));
        $this->assertFalse($guard->matches($reservation, [array_replace($payment, ['_id' => str_repeat('b', 24)])], $snapshot));
        $this->assertFalse($guard->matches($reservation, [array_replace($payment, ['_idpaymentProvider' => str_repeat('b', 24)])], $snapshot));
    }

    public function test_bootstrap_requires_reviewed_status_and_partner_before_payment_but_allows_confirmation_after(): void
    {
        $reservation = ['_id' => 'r', '_idclient' => 'c', '_idlisting' => 'l', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'type' => 'reserved', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 395]];
        $payment = ['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $snapshot = ['_id' => 'r', '_idclient' => 'c', '_idlisting' => 'l', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750, 'reported_paid_present' => false, 'reported_paid_cents' => null, 'payment_id' => str_repeat('a', 24), 'pending_provider_id' => str_repeat('f', 24), 'bootstrap_receivable' => true, 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com'];
        $guard = new ExistingReservationPaymentGuard(new ExistingReservationBalance);
        $this->assertTrue($guard->matches($reservation, [$payment], $snapshot));
        $booked = array_replace($reservation, ['type' => 'booked']);
        $this->assertFalse($guard->matches($booked, [$payment], $snapshot));
        $this->assertTrue($guard->matches($booked, [$payment], $snapshot, allowConfirmedTransition: true));
        $this->assertFalse($guard->matches(array_replace($reservation, ['partner' => ['name' => 'API other']]), [$payment], $snapshot, allowConfirmedTransition: true));
        $snapshot['reservation_type'] = 'booked';
        $this->assertFalse($guard->matches($reservation, [$payment], $snapshot, allowConfirmedTransition: true));
    }

    public function test_reported_paid_snapshot_must_not_change_even_if_pending_amount_still_fits(): void
    {
        $reservation = ['_id' => 'r', '_idclient' => 'c', '_idlisting' => 'l', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'type' => 'booked', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 0]];
        $payment = ['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $snapshot = ['_id' => 'r', '_idclient' => 'c', '_idlisting' => 'l', 'checkInDate' => '2026-11-13', 'checkOutDate' => '2026-11-16', 'guests' => 4, 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750, 'payment_id' => str_repeat('a', 24), 'pending_provider_id' => str_repeat('f', 24), 'reported_paid_present' => true, 'reported_paid_cents' => 0];
        $guard = new ExistingReservationPaymentGuard(new ExistingReservationBalance);
        $this->assertTrue($guard->matches($reservation, [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['stats' => ['_f_totalPaid' => 100]]), [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['stats' => []]), [$payment], $snapshot));
        $this->assertFalse($guard->matches(array_replace($reservation, ['stats' => ['_f_totalPaid' => null]]), [$payment], $snapshot));
        $snapshot['reported_paid_present'] = false;
        $snapshot['reported_paid_cents'] = null;
        $this->assertFalse($guard->matches($reservation, [$payment], $snapshot));
    }
}
