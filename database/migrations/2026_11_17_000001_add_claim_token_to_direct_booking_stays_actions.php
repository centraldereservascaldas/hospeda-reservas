<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_booking_stays_actions', function (Blueprint $table): void {
            $table->uuid('claim_token')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('direct_booking_stays_actions', function (Blueprint $table): void {
            $table->dropColumn('claim_token');
        });
    }
};
