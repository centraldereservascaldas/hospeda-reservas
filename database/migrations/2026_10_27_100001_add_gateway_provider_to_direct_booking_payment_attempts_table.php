<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider')) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                $table->string('gateway_provider', 40)->default('mercadopago')->after('gateway_payment_id')->index();
            });
        } elseif (! Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider'])) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                $table->index('gateway_provider');
            });
        }
    }

    public function down(): void
    {
        $hasSharedMigration = DB::table('migrations')
            ->where('migration', '2026_10_26_190922_add_gateway_provider_to_direct_booking_payment_tables')
            ->exists();

        if (! $hasSharedMigration && Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider')) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                if (Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider'])) {
                    $table->dropIndex(['gateway_provider']);
                }

                $table->dropColumn('gateway_provider');
            });
        }
    }
};
