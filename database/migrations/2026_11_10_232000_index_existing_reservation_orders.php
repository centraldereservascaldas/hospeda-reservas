<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->index(['origin', 'stays_reservation_id'], 'direct_orders_origin_stays_idx');
        });
    }

    public function down(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropIndex('direct_orders_origin_stays_idx');
        });
    }
};
