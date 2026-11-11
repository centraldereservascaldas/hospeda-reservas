<?php

namespace Tests\Feature;

use App\Services\ExistingReservationPaymentLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

class ExistingReservationPaymentLockTest extends TestCase
{
    use RefreshDatabase;

    public function test_canonical_id_shares_one_durable_lock_and_runs_in_transaction(): void
    {
        $lock = app(ExistingReservationPaymentLock::class);
        $result = $lock->synchronized(str_repeat('A', 24), function (string $id): string {
            $this->assertGreaterThan(0, DB::transactionLevel());

            return $id;
        });
        $this->assertSame(str_repeat('a', 24), $result);
        $lock->synchronized(str_repeat('a', 24), fn (string $id): string => $id);
        $lock->synchronized(str_repeat('b', 24), fn (string $id): string => $id);
        $this->assertSame(2, DB::table('existing_reservation_payment_locks')->where('stays_reservation_id', '!=', 'coordination-decision')->count());
        $this->assertDatabaseHas('existing_reservation_payment_locks', ['stays_reservation_id' => str_repeat('a', 24)]);
    }

    public function test_invalid_or_short_id_is_never_used_as_a_lock_key(): void
    {
        $this->expectException(InvalidArgumentException::class);
        app(ExistingReservationPaymentLock::class)->synchronized('ZX91K', fn (): null => null);
    }

    public function test_failed_decision_is_rolled_back(): void
    {
        try {
            app(ExistingReservationPaymentLock::class)->synchronized(str_repeat('a', 24), function (): void {
                DB::table('existing_reservation_payment_locks')->insert([
                    'stays_reservation_id' => str_repeat('b', 24),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                throw new RuntimeException('Abort this decision');
            });
            $this->fail('Expected the transaction to be aborted.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Abort this decision', $exception->getMessage());
        }

        $this->assertDatabaseCount('existing_reservation_payment_locks', 0);
    }
}
