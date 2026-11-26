<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partner_checkout_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('public_reference', 64)->unique();
            $table->string('submission_key_hash', 64)->nullable()->unique();
            $table->string('submission_fingerprint', 64)->nullable();
            $table->string('supplier_property_id', 100);
            $table->date('check_in');
            $table->date('check_out');
            $table->unsignedInteger('guests');
            $table->unsignedBigInteger('base_cents');
            $table->unsignedBigInteger('payment_cents');
            $table->string('currency', 3)->default('BRL');
            $table->string('status', 40)->index();
            $table->string('attention_reason', 50)->nullable();
            $table->string('payment_id', 100)->nullable()->unique();
            $table->text('payment_qr_code')->nullable();
            $table->string('merchant_order_id', 36)->unique();
            $table->string('payment_method', 12);
            $table->unsignedTinyInteger('installments')->nullable();
            $table->string('reservation_reference', 100)->nullable();
            $table->unsignedBigInteger('supplier_payable_observed_cents')->nullable();
            $table->unsignedBigInteger('supplier_paid_cents')->nullable();
            $table->string('supplier_payment_reference', 100)->nullable();
            $table->string('supplier_paid_by', 100)->nullable();
            $table->timestamp('supplier_paid_at')->nullable();
            $table->string('reservation_idempotency_key', 128)->unique();
            $table->text('encrypted_customer');
            $table->timestamp('recovery_requested_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_checkout_orders');
    }
};
