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
        Schema::create('partner_payment_attempts', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('partner_checkout_order_id')->constrained('partner_checkout_orders')->restrictOnDelete();
            $table->string('supplier_property_id', 100);
            $table->string('gateway_provider', 40)->default('cielo');
            $table->string('merchant_order_id', 100);
            $table->string('gateway_payment_id', 100)->nullable()->unique();
            $table->string('payment_method', 12);
            $table->unsignedTinyInteger('installments')->nullable();
            $table->unsignedBigInteger('amount_cents');
            $table->char('currency', 3)->default('BRL');
            $table->string('status', 40)->index();
            $table->string('provider_status', 40)->nullable();
            $table->string('provider_status_detail', 100)->nullable();
            $table->string('error_code', 100)->nullable();
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('provider_updated_at')->nullable();
            $table->timestampsTz();
            $table->index(['partner_checkout_order_id', 'created_at']);
        });

        Schema::create('partner_checkout_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->foreignUuid('partner_checkout_order_id')->constrained('partner_checkout_orders')->restrictOnDelete();
            $table->string('event_type', 60);
            $table->string('from_status', 40)->nullable();
            $table->string('to_status', 40)->nullable();
            $table->string('attention_reason', 50)->nullable();
            $table->string('source', 30)->default('system');
            $table->string('provider_status', 40)->nullable();
            $table->string('error_code', 100)->nullable();
            $table->json('metadata')->nullable();
            $table->timestampTz('occurred_at');
            $table->timestampsTz();
            $table->index(['partner_checkout_order_id', 'occurred_at', 'id'], 'partner_checkout_events_timeline_idx');
        });

        Schema::create('partner_payment_notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->char('event_key', 64)->unique();
            $table->foreignUuid('partner_checkout_order_id')->nullable()->constrained('partner_checkout_orders')->restrictOnDelete();
            $table->foreignUuid('partner_payment_attempt_id')->nullable()->constrained('partner_payment_attempts')->restrictOnDelete();
            $table->string('gateway_provider', 40)->default('cielo');
            $table->string('gateway_payment_id', 100)->index();
            $table->unsignedSmallInteger('change_type');
            $table->string('request_id', 150)->nullable();
            $table->string('status', 30)->default('received')->index();
            $table->string('error_code', 100)->nullable();
            $table->unsignedTinyInteger('reconciliation_attempts')->default(0);
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
        Schema::dropIfExists('partner_payment_notifications');
        Schema::dropIfExists('partner_checkout_events');
        Schema::dropIfExists('partner_payment_attempts');
    }
};
