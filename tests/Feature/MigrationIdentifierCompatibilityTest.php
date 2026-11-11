<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MigrationIdentifierCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_indexes_use_distinct_short_names(): void
    {
        foreach (['erc_reservation_idx', 'erc_active_reservation_unique', 'erc_attempt_unique', 'erc_idempotency_unique'] as $index) {
            $this->assertLessThanOrEqual(63, strlen($index));
            $this->assertTrue(Schema::hasIndex('existing_reservation_payment_cycles', $index));
        }
        $this->assertTrue(Schema::hasIndex('direct_booking_payment_attempts', 'dba_stays_canonical_idx'));
        $foreignKeys = Schema::getForeignKeys('existing_reservation_payment_cycles');
        $this->assertCount(2, $foreignKeys);
        if (DB::connection()->getDriverName() === 'pgsql') {
            $names = array_column($foreignKeys, 'name');
            $this->assertContains('erc_order_fk', $names);
            $this->assertContains('erc_attempt_fk', $names);
        }
    }
}
