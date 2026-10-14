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
        Schema::create('direct_booking_emails', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('direct_booking_order_id')->constrained('direct_booking_orders')->restrictOnDelete();
            $table->string('notification_type');
            $table->string('status')->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamp('queued_at')->nullable();
            $table->timestamp('next_attempt_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->string('error_code')->nullable();
            $table->unique(['direct_booking_order_id', 'notification_type']);
            $table->index(['status', 'next_attempt_at']);
            $table->index(['status', 'queued_at']);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('direct_booking_emails');
    }
};
