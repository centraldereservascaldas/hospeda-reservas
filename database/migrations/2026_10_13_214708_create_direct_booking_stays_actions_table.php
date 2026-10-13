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
        Schema::create('direct_booking_stays_actions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('direct_booking_order_id')->constrained('direct_booking_orders')->restrictOnDelete();
            $table->string('action_type', 40);
            $table->string('status', 40)->default('pending')->index();
            $table->string('idempotency_key', 160)->unique();
            $table->json('request_snapshot');
            $table->json('response_snapshot')->nullable();
            $table->string('external_id', 100)->nullable()->index();
            $table->unsignedInteger('attempt_count')->default(0);
            $table->timestampTz('last_attempt_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampTz('attention_required_at')->nullable()->index();
            $table->string('error_code', 100)->nullable();
            $table->string('error_message', 500)->nullable();
            $table->timestamps();
            $table->unique(['direct_booking_order_id', 'action_type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('direct_booking_stays_actions');
    }
};
