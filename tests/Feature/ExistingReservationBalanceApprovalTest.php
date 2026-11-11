<?php

namespace Tests\Feature;

use App\Services\ExistingReservationBalanceApproval;
use Tests\TestCase;

class ExistingReservationBalanceApprovalTest extends TestCase
{
    public function test_review_expires_and_is_bound_to_commercial_snapshot_and_version(): void
    {
        $id = str_repeat('c', 24);
        $snapshot = ['_id' => $id, '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2030-11-19',
            'checkOutDate' => '2030-11-22', 'guests' => 4, 'currency' => 'BRL', 'reservation_total_cents' => 101600,
            'pending_amount_cents' => 101600, 'approval_version' => 'review-1', 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com'];
        $record = $snapshot;
        unset($record['_id'], $record['approval_version']);
        $record['version'] = 'review-1';
        $record['expires_at'] = '2030-01-01T00:00:00+00:00';
        config(['direct-booking.experimental_existing_approved_balances' => [$id => $record]]);
        $this->assertTrue(ExistingReservationBalanceApproval::approved($snapshot));
        foreach (['_idclient' => 'other-client', '_idlisting' => 'other-listing', 'checkInDate' => '2030-11-20', 'checkOutDate' => '2030-11-23',
            'guests' => 3, 'currency' => 'USD', 'reservation_type' => 'booked', 'partner_name' => 'api other', 'reservation_total_cents' => 102600, 'pending_amount_cents' => 101500, 'approval_version' => 'review-2'] as $key => $value) {
            $this->assertFalse(ExistingReservationBalanceApproval::approved(array_replace($snapshot, [$key => $value])), $key);
        }
        $record['expires_at'] = '2020-01-01T00:00:00+00:00';
        config(['direct-booking.experimental_existing_approved_balances' => [$id => $record]]);
        $this->assertFalse(ExistingReservationBalanceApproval::approved($snapshot));
        $record['expires_at'] = 'not-a-date';
        config(['direct-booking.experimental_existing_approved_balances' => [$id => $record]]);
        $this->assertFalse(ExistingReservationBalanceApproval::approved($snapshot));
        config(['direct-booking.experimental_existing_approved_balances' => []]);
        $this->assertFalse(ExistingReservationBalanceApproval::approved($snapshot));
    }
}
