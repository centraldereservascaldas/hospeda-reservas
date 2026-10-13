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
            $table->string('stays_client_id', 100)->nullable()->after('stays_listing_id');
            $table->string('reservation_status', 40)->nullable()->index()->after('stays_client_id');
            $table->string('public_reference', 64)->nullable()->unique()->after('idempotency_key');
            $table->text('resume_token')->nullable()->after('public_reference');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropUnique(['public_reference']);
            $table->dropColumn(['stays_client_id', 'reservation_status', 'public_reference', 'resume_token']);
        });
    }
};
