<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->index(['payment_method', 'expires_at'], 'dba_pix_expiry_idx');
        });

        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->index('payment_expires_at', 'dbo_payment_expiry_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropIndex('dbo_payment_expiry_idx');
        });

        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->dropIndex('dba_pix_expiry_idx');
        });
    }
};
