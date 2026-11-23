<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->timestampTz('deposit_verification_due_at')->nullable();
            $table->timestampTz('deposit_verification_lease_until')->nullable();
            $table->uuid('deposit_verification_lease_token')->nullable();
            $table->index(['origin', 'status', 'payment_status', 'deposit_verification_due_at'], 'direct_orders_deposit_due_idx');
        });
    }

    public function down(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropIndex('direct_orders_deposit_due_idx');
            $table->dropColumn(['deposit_verification_due_at', 'deposit_verification_lease_until', 'deposit_verification_lease_token']);
        });
    }
};
