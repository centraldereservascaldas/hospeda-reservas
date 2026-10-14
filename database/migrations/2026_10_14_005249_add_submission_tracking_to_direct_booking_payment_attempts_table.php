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
            $table->string('gateway_idempotency_key', 64)->nullable()->unique();
            $table->timestampTz('gateway_submission_started_at')->nullable()->index();
            $table->unsignedTinyInteger('gateway_submission_count')->default(0);
            $table->text('gateway_retry_payload')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->dropUnique(['gateway_idempotency_key']);
            $table->dropIndex(['gateway_submission_started_at']);
            $table->dropColumn(['gateway_idempotency_key', 'gateway_submission_started_at', 'gateway_submission_count', 'gateway_retry_payload']);
        });
    }
};
