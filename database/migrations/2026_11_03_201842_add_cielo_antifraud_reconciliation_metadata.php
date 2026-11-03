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
        Schema::table('direct_booking_payment_webhooks', function (Blueprint $table) {
            $table->unsignedSmallInteger('change_type')->nullable();
        });
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table) {
            $table->boolean('fraud_analysis_required')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table) {
            $table->dropColumn('fraud_analysis_required');
        });
        Schema::table('direct_booking_payment_webhooks', function (Blueprint $table) {
            $table->dropColumn('change_type');
        });
    }
};
