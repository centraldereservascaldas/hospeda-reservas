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
        Schema::table('direct_booking_orders', function (Blueprint $table) {
            $table->string('existing_checkout_recovery_hash', 64)->nullable()->unique();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table) {
            $table->dropUnique(['existing_checkout_recovery_hash']);
            $table->dropColumn('existing_checkout_recovery_hash');
        });
    }
};
