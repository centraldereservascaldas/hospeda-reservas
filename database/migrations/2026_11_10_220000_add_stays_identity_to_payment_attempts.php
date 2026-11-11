<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->char('stays_reservation_canonical_id', 24)->nullable()->index('dba_stays_canonical_idx');
        });
    }

    public function down(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->dropIndex('dba_stays_canonical_idx');
            $table->dropColumn('stays_reservation_canonical_id');
        });
    }
};
