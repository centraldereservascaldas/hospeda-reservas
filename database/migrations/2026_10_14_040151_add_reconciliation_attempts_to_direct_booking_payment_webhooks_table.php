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
        Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
            $table->unsignedTinyInteger('reconciliation_attempts')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
            $table->dropColumn('reconciliation_attempts');
        });
    }
};
