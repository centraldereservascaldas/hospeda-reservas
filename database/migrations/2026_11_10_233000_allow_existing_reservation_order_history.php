<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['sqlite', 'mysql', 'pgsql'], true)) {
            throw new RuntimeException('Unsupported database for reservation history migration.');
        }
        // MySQL DDL is not transactional. Never guess whether an existing
        // generated column or index has the required expression after a partial
        // migration: stop for schema inspection instead of weakening uniqueness.
        if (Schema::hasColumn('direct_booking_orders', 'website_stays_reservation_id')
            || Schema::hasIndex('direct_booking_orders', 'direct_orders_website_stays_unique')
            || ! Schema::hasIndex('direct_booking_orders', 'direct_booking_orders_stays_reservation_id_unique')) {
            throw new RuntimeException('Reservation history schema is partial or already changed; inspect it before retrying.');
        }

        // Both constraints coexist until the replacement index has been created.
        Schema::table('direct_booking_orders', function (Blueprint $table) use ($driver): void {
            $column = $table->string('website_stays_reservation_id', 100)->nullable();
            $expression = "CASE WHEN origin = 'stays_existing' THEN NULL ELSE stays_reservation_id END";
            $driver === 'sqlite' ? $column->virtualAs($expression) : $column->storedAs($expression);
            $table->unique('website_stays_reservation_id', 'direct_orders_website_stays_unique');
        });
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropUnique('direct_booking_orders_stays_reservation_id_unique');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('direct_booking_orders', 'website_stays_reservation_id')
            || ! Schema::hasIndex('direct_booking_orders', 'direct_orders_website_stays_unique')
            || Schema::hasIndex('direct_booking_orders', 'direct_booking_orders_stays_reservation_id_unique')) {
            throw new RuntimeException('Reservation history rollback is partial or schema is unexpected; inspect it before retrying.');
        }
        // Restoring the old constraint must never erase or rewrite history.
        $duplicates = DB::table('direct_booking_orders')->select('stays_reservation_id')->whereNotNull('stays_reservation_id')
            ->groupBy('stays_reservation_id')->havingRaw('COUNT(*) > 1')->exists();
        if ($duplicates) {
            throw new RuntimeException('Cannot restore the original reservation uniqueness while multiple orders exist.');
        }
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->unique('stays_reservation_id', 'direct_booking_orders_stays_reservation_id_unique');
        });
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropUnique('direct_orders_website_stays_unique');
            $table->dropColumn('website_stays_reservation_id');
        });
    }
};
