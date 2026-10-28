<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DirectBookingResumeTokenMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_down_drops_expiration_index_before_column(): void
    {
        $this->assertTrue(Schema::hasIndex('direct_booking_orders', ['resume_token_expires_at']));
        $migration = require database_path('migrations/2026_10_14_172057_add_resume_token_expiration_to_direct_booking_orders_table.php');

        $migration->down();

        $this->assertFalse(Schema::hasColumn('direct_booking_orders', 'resume_token_expires_at'));
        $this->assertFalse(Schema::hasIndex('direct_booking_orders', ['resume_token_expires_at']));
    }

    public function test_down_drops_expiration_column_when_legacy_schema_has_no_index(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropIndex(['resume_token_expires_at']);
        });
        $this->assertFalse(Schema::hasIndex('direct_booking_orders', ['resume_token_expires_at']));
        $migration = require database_path('migrations/2026_10_14_172057_add_resume_token_expiration_to_direct_booking_orders_table.php');

        $migration->down();

        $this->assertFalse(Schema::hasColumn('direct_booking_orders', 'resume_token_expires_at'));
    }

    public function test_legacy_tokens_receive_creation_based_expiry_and_expired_token_is_pruned_without_deleting_order(): void
    {
        $this->travelTo('2026-10-24 12:00:00');
        config(['direct-booking.resume_token_ttl_days' => 30]);
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropIndex(['resume_token_expires_at']);
            $table->dropColumn('resume_token_expires_at');
        });
        $this->assertFalse(Schema::hasColumn('direct_booking_orders', 'resume_token_expires_at'));
        $this->insertLegacyOrder('00000000-0000-4000-8000-000000000001', '2026-09-01 12:00:00');
        $this->insertLegacyOrder('00000000-0000-4000-8000-000000000002', '2026-10-01 12:00:00');
        $migration = require database_path('migrations/2026_10_14_172057_add_resume_token_expiration_to_direct_booking_orders_table.php');

        $migration->up();

        $this->assertTrue(Schema::hasColumn('direct_booking_orders', 'resume_token_expires_at'));
        $this->assertTrue(Schema::hasIndex('direct_booking_orders', ['resume_token_expires_at']));
        $this->assertDatabaseHas('direct_booking_orders', ['id' => '00000000-0000-4000-8000-000000000001', 'resume_token_expires_at' => '2026-10-01 12:00:00']);
        $this->assertDatabaseHas('direct_booking_orders', ['id' => '00000000-0000-4000-8000-000000000002', 'resume_token_expires_at' => '2026-10-31 12:00:00']);

        $this->artisan('direct-booking:prune-expired-resume-tokens')->assertSuccessful();

        $this->assertDatabaseHas('direct_booking_orders', ['id' => '00000000-0000-4000-8000-000000000001', 'resume_token' => null, 'resume_token_expires_at' => '2026-10-01 12:00:00']);
        $this->assertDatabaseHas('direct_booking_orders', ['id' => '00000000-0000-4000-8000-000000000002', 'resume_token' => 'legacy-token', 'resume_token_expires_at' => '2026-10-31 12:00:00']);
        $this->travelBack();
    }

    private function insertLegacyOrder(string $id, string $createdAt): void
    {
        DB::table('direct_booking_orders')->insert([
            'id' => $id,
            'idempotency_key' => $id,
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'TEST',
            'stays_listing_id' => 'TEST',
            'check_in' => '2026-11-01',
            'check_out' => '2026-11-02',
            'guests' => '{}',
            'guest_name' => 'Test Guest',
            'guest_email' => $id.'@example.test',
            'guest_phone' => '123456789',
            'quote_total' => 100,
            'currency' => 'BRL',
            'quote_snapshot' => '{}',
            'accepted_terms_version' => 'test',
            'accepted_terms_snapshot' => '{}',
            'terms_accepted_at' => $createdAt,
            'operational_events' => '[]',
            'resume_token' => 'legacy-token',
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);
    }
}
