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
        Schema::create('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('direct_booking_order_id')->constrained('direct_booking_orders')->restrictOnDelete();
            $table->string('idempotency_key', 128)->unique();
            $table->char('request_fingerprint', 64);
            $table->string('gateway_payment_id', 150)->nullable()->unique();
            $table->string('payment_method', 20);
            $table->string('payment_method_id', 50);
            $table->unsignedTinyInteger('installments')->nullable();
            $table->string('status', 40)->index();
            $table->string('gateway_status', 40)->nullable();
            $table->string('gateway_status_detail', 100)->nullable();
            $table->string('payment_method_detail', 50)->nullable();
            $table->decimal('amount', 12, 2);
            $table->char('currency', 3);
            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampTz('gateway_updated_at')->nullable();
            $table->text('pix_copy_paste')->nullable();
            $table->longText('pix_qr_code_base64')->nullable();
            $table->string('error_code', 100)->nullable();
            $table->timestampsTz();
            $table->index(['direct_booking_order_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('direct_booking_payment_attempts');
    }
};
