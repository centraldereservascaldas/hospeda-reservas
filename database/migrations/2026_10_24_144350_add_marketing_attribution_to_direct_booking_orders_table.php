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
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->json('marketing_attribution')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropColumn('marketing_attribution');
        });
    }
};
