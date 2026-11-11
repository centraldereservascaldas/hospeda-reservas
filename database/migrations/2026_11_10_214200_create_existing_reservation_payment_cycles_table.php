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
        Schema::create('existing_reservation_payment_cycles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->char('stays_reservation_id', 24)->index();
            $table->char('active_reservation_id', 24)->nullable()->unique();
            $table->foreignUuid('direct_booking_order_id')->constrained('direct_booking_orders')->restrictOnDelete();
            $table->foreignUuid('direct_booking_payment_attempt_id')->nullable()->unique()->constrained('direct_booking_payment_attempts')->restrictOnDelete();
            $table->string('idempotency_key', 128)->unique();
            $table->string('state', 40);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('existing_reservation_payment_cycles');
    }
};
