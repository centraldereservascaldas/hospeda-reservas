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
            $table->char('stays_reservation_id', 24)->index('erc_reservation_idx');
            $table->char('active_reservation_id', 24)->nullable()->unique('erc_active_reservation_unique');
            $table->foreignUuid('direct_booking_order_id')->constrained('direct_booking_orders', indexName: 'erc_order_fk')->restrictOnDelete();
            $table->foreignUuid('direct_booking_payment_attempt_id')->nullable()->unique('erc_attempt_unique')
                ->constrained('direct_booking_payment_attempts', indexName: 'erc_attempt_fk')->restrictOnDelete();
            $table->string('idempotency_key', 128)->unique('erc_idempotency_unique');
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
