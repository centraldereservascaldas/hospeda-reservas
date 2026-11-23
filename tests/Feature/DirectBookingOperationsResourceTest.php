<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Resources\DirectBookingOperationsResource;
use App\Http\Resources\DirectBookingOrderResource;
use App\Models\DirectBookingOrder;
use Illuminate\Http\Request;
use Tests\TestCase;

class DirectBookingOperationsResourceTest extends TestCase
{
    public function test_approved_existing_deposit_is_not_reported_as_an_unconfirmed_reservation(): void
    {
        $this->assertFalse($this->unconfirmedAlert('stays_existing', DirectBookingOrderStatus::EntradaConciliada, 'approved'));
        $this->assertTrue($this->unconfirmedAlert('stays_existing', DirectBookingOrderStatus::AtencaoOperacional, 'approved'));
        $this->assertTrue($this->unconfirmedAlert('website', DirectBookingOrderStatus::EntradaConciliada, 'approved'));
        $this->assertFalse($this->unconfirmedAlert('stays_existing', DirectBookingOrderStatus::EntradaConciliada, 'refunded'));
        $this->assertFalse($this->unconfirmedAlert('stays_existing', DirectBookingOrderStatus::Confirmado, 'approved'));
    }

    public function test_deposit_verification_alert_follows_the_latest_verification(): void
    {
        $order = new DirectBookingOrder([
            'origin' => 'stays_existing',
            'status' => DirectBookingOrderStatus::EntradaConciliada,
            'payment_status' => 'approved',
            'check_in' => '2030-01-01',
            'check_out' => '2030-01-02',
            'operational_events' => [
                ['event' => 'existing_deposit_verification', 'verified' => false],
                ['event' => 'other_event'],
            ],
        ]);
        $resource = fn () => (new DirectBookingOperationsResource($order))->resolve(Request::create('/'));
        $this->assertTrue($resource()['existingDepositReviewRequired']);
        $this->assertFalse($resource()['paymentApprovedWithoutConfirmedReservation']);

        $order->operational_events = [
            ['event' => 'existing_deposit_verification', 'verified' => false],
            ['event' => 'existing_deposit_verification', 'verified' => true],
        ];
        $this->assertFalse($resource()['existingDepositReviewRequired']);
        $order->origin = 'website';
        $order->operational_events = [['event' => 'existing_deposit_verification', 'verified' => false]];
        $this->assertFalse($resource()['existingDepositReviewRequired']);
    }

    public function test_an_unfinished_latest_deposit_verification_requires_review_in_both_resources(): void
    {
        $order = new DirectBookingOrder([
            'origin' => 'stays_existing', 'status' => DirectBookingOrderStatus::EntradaConciliada,
            'payment_status' => 'approved', 'check_in' => '2030-01-01', 'check_out' => '2030-01-02',
            'operational_events' => [
                ['event' => 'existing_deposit_verification', 'verified' => true],
                ['event' => 'existing_deposit_verification_started', 'id' => 'first'],
                ['event' => 'existing_deposit_verification_started', 'id' => 'second'],
                ['event' => 'existing_deposit_verification', 'id' => 'first', 'verified' => true],
            ],
        ]);
        $assertReview = function (bool $expected) use ($order): void {
            $request = Request::create('/');
            $this->assertSame($expected, (new DirectBookingOperationsResource($order))->resolve($request)['existingDepositReviewRequired']);
            $this->assertSame($expected, (new DirectBookingOrderResource($order))->resolve($request)['existingDepositReviewRequired']);
        };
        $assertReview(true);
        $events = $order->operational_events;
        $events[] = ['event' => 'existing_deposit_verification', 'id' => 'second', 'verified' => false];
        $order->operational_events = $events;
        $assertReview(true);
        $events[] = ['event' => 'existing_deposit_verification_started', 'id' => 'third'];
        $events[] = ['event' => 'existing_deposit_verification', 'id' => 'third', 'verified' => true];
        $order->operational_events = $events;
        $assertReview(false);
        $events[] = ['event' => 'existing_deposit_verification_started', 'id' => 'fourth'];
        $order->operational_events = $events;
        $assertReview(true);
    }

    private function unconfirmedAlert(string $origin, DirectBookingOrderStatus $status, string $paymentStatus): bool
    {
        $order = new DirectBookingOrder([
            'origin' => $origin,
            'status' => $status,
            'payment_status' => $paymentStatus,
            'check_in' => '2030-01-01',
            'check_out' => '2030-01-02',
            'operational_events' => [],
        ]);

        return (new DirectBookingOperationsResource($order))->resolve(Request::create('/'))['paymentApprovedWithoutConfirmedReservation'];
    }
}
