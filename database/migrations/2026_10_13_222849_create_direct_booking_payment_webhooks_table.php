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
        Schema::create('direct_booking_payment_webhooks', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->char('event_key', 64)->unique();
            $table->string('gateway_payment_id', 150)->index();
            $table->string('request_id', 150)->nullable();
            $table->string('status', 30)->default('received')->index();
            $table->string('error_code', 100)->nullable();
            $table->timestampTz('received_at');
            $table->timestampTz('processed_at')->nullable();
            $table->timestampsTz();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('direct_booking_payment_webhooks');
    }
};
