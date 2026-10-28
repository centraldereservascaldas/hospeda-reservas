<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class GatewayProviderMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_payment_records_keep_their_data_and_use_mercado_pago_provider_default(): void
    {
        $orderId = (string) Str::uuid();
        $attemptId = (string) Str::uuid();
        $now = now();

        DB::table('direct_booking_orders')->insert([
            'id' => $orderId,
            'idempotency_key' => 'legacy-order-key',
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'listing-1',
            'stays_listing_id' => 'stays-1',
            'check_in' => '2026-11-01',
            'check_out' => '2026-11-02',
            'guests' => '[]',
            'guest_name' => 'Existing Guest',
            'guest_email' => 'guest@example.test',
            'guest_phone' => '+5511999999999',
            'quote_total' => '100.00',
            'currency' => 'BRL',
            'quote_snapshot' => '{}',
            'accepted_terms_version' => 'v1',
            'accepted_terms_snapshot' => '{}',
            'terms_accepted_at' => $now,
            'operational_events' => '[]',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('direct_booking_payment_attempts')->insert([
            'id' => $attemptId,
            'direct_booking_order_id' => $orderId,
            'idempotency_key' => 'legacy-attempt-key',
            'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix',
            'payment_method_id' => 'pix',
            'status' => 'pending',
            'amount' => '100.00',
            'currency' => 'BRL',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('direct_booking_payment_webhooks')->insert([
            'id' => (string) Str::uuid(),
            'event_key' => str_repeat('c', 64),
            'gateway_payment_id' => 'legacy-payment-id',
            'received_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->assertDatabaseHas('direct_booking_orders', [
            'id' => $orderId,
            'guest_email' => 'guest@example.test',
            'gateway_provider' => 'mercadopago',
        ]);
        $this->assertDatabaseHas('direct_booking_payment_attempts', [
            'id' => $attemptId,
            'amount' => '100.00',
            'gateway_provider' => 'mercadopago',
        ]);
        $this->assertDatabaseHas('direct_booking_payment_webhooks', [
            'event_key' => str_repeat('c', 64),
            'gateway_provider' => 'mercadopago',
        ]);
    }

    public function test_gateway_provider_migrations_upgrade_and_rollback_in_either_order(): void
    {
        $originalConnection = DB::getDefaultConnection();
        $connection = DB::connection($originalConnection);
        $postgresSchema = null;

        if ($connection->getDriverName() === 'pgsql') {
            $postgresSchema = 'gateway_migration_test_'.Str::lower(Str::random(12));
            $connection->statement('CREATE SCHEMA "'.$postgresSchema.'"');
            $connection->statement('SET search_path TO "'.$postgresSchema.'"');
        } else {
            config(['database.connections.gateway_migration_test' => [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
                'foreign_key_constraints' => true,
            ]]);
            DB::purge('gateway_migration_test');
            DB::setDefaultConnection('gateway_migration_test');
        }

        try {
            $this->createGatewayMigrationBaseSchema();
            $shared = require database_path('migrations/2026_10_26_190922_add_gateway_provider_to_direct_booking_payment_tables.php');
            $main = require database_path('migrations/2026_10_27_100001_add_gateway_provider_to_direct_booking_payment_attempts_table.php');

            $main->up();
            $this->recordMigration('2026_10_27_100001_add_gateway_provider_to_direct_booking_payment_attempts_table');
            $shared->up();
            $this->recordMigration('2026_10_26_190922_add_gateway_provider_to_direct_booking_payment_tables');
            $shared->up();
            $this->assertTrue(Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider']));
            $shared->down();
            $this->assertTrue(Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider'));
            $this->assertTrue(Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider']));
            DB::table('migrations')->where('migration', '2026_10_26_190922_add_gateway_provider_to_direct_booking_payment_tables')->delete();
            $main->down();
            $this->assertFalse(Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider'));

            Schema::dropIfExists('direct_booking_orders');
            Schema::dropIfExists('direct_booking_payment_attempts');
            Schema::dropIfExists('direct_booking_payment_webhooks');
            Schema::dropIfExists('migrations');
            $this->createGatewayMigrationBaseSchema();

            $shared->up();
            $this->recordMigration('2026_10_26_190922_add_gateway_provider_to_direct_booking_payment_tables');
            $main->up();
            $this->recordMigration('2026_10_27_100001_add_gateway_provider_to_direct_booking_payment_attempts_table');
            $this->assertTrue(Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider']));
            $main->down();
            $this->assertTrue(Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider'));
            DB::table('migrations')->where('migration', '2026_10_27_100001_add_gateway_provider_to_direct_booking_payment_attempts_table')->delete();
            $shared->down();
            $this->assertFalse(Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider'));
            $this->assertFalse(Schema::hasColumn('direct_booking_payment_attempts', 'gateway_merchant_id'));
            $this->assertFalse(Schema::hasColumn('direct_booking_payment_attempts', 'merchant_order_id'));
        } finally {
            if ($postgresSchema !== null) {
                $connection->statement('RESET search_path');
                $connection->statement('DROP SCHEMA "'.$postgresSchema.'" CASCADE');
            } else {
                DB::purge('gateway_migration_test');
                DB::setDefaultConnection($originalConnection);
            }
        }
    }

    private function createGatewayMigrationBaseSchema(): void
    {
        Schema::create('migrations', function (Blueprint $table): void {
            $table->id();
            $table->string('migration');
            $table->integer('batch');
        });
        Schema::create('direct_booking_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
        });
        Schema::create('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('gateway_payment_id')->nullable();
        });
        Schema::create('direct_booking_payment_webhooks', function (Blueprint $table): void {
            $table->uuid('id')->primary();
        });
    }

    private function recordMigration(string $migration): void
    {
        DB::table('migrations')->insert(['migration' => $migration, 'batch' => 1]);
    }
}
