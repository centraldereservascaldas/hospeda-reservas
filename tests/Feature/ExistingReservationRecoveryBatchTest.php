<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\DirectStaysPaymentService;
use App\Services\DirectStaysReservationService;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\TestCase;

class ExistingReservationRecoveryBatchTest extends TestCase
{
    public function test_a_failed_deposit_verification_does_not_stop_other_orders(): void
    {
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate');
        $this->freezeTime();
        config([
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'test',
            'services.stays.client_secret' => 'test',
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.experimental_existing_deposit_enabled' => true,
            'direct-booking.experimental_existing_cycle_settlement_enabled' => true,
            'direct-booking.experimental_existing_ledger_audit_enabled' => true,
        ]);
        $orders = [];
        foreach (['a', 'b'] as $suffix) {
            $orders[] = DirectBookingOrder::query()->create([
                'status' => DirectBookingOrderStatus::EntradaConciliada,
                'payment_status' => 'approved', 'reservation_status' => 'reserved',
                'idempotency_key' => 'order-'.$suffix, 'request_fingerprint' => str_repeat('a', 64),
                'listing_id' => 'listing', 'stays_listing_id' => 'listing',
                'stays_reservation_id' => str_repeat($suffix, 24),
                'check_in' => '2030-11-13', 'check_out' => '2030-11-16',
                'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0],
                'guest_name' => 'Teste', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
                'quote_total' => '10.00', 'currency' => 'BRL', 'quote_snapshot' => [],
                'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [],
                'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'operational_events' => [],
                'deposit_verification_due_at' => now()->subMinute(),
            ]);
        }
        $seen = [];
        $this->mock(DirectStaysPaymentService::class, function ($mock) use (&$seen): void {
            $mock->shouldReceive('confirmPaidReservation')->twice()->andReturnUsing(function (DirectBookingOrder $order) use (&$seen): array {
                $seen[] = $order->id;
                if (count($seen) === 1) {
                    throw new RuntimeException('sensitive external response');
                }

                return ['ready' => true, 'code' => 'verified', 'message' => 'ok'];
            });
        });
        Log::shouldReceive('error')->once()->withArgs(function (string $message, array $context) use (&$seen): bool {
            return $message === 'Deposit verification failed unexpectedly.'
                && $context === ['order_id' => $seen[0], 'exception_class' => RuntimeException::class];
        });

        $result = app(DirectStaysReservationService::class)->recover();

        $this->assertSame(['processed' => 2, 'attention' => 1], $result);
        $this->assertCount(2, $seen);
        foreach ($orders as $order) {
            $this->assertNull($order->fresh()->deposit_verification_lease_token);
            $this->assertNotNull($order->fresh()->deposit_verification_due_at);
        }
    }
}
