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
            $table->string('gateway_provider', 40)->default('mercadopago')->index();
            $table->string('gateway_merchant_id', 100)->nullable();
        });

        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->string('gateway_provider', 40)->default('mercadopago')->index();
            $table->string('gateway_merchant_id', 100)->nullable();
            $table->string('merchant_order_id', 36)->nullable()->unique();
        });

        Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
            $table->string('gateway_provider', 40)->default('mercadopago')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
            $table->dropIndex(['gateway_provider']);
            $table->dropColumn('gateway_provider');
        });

        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->dropUnique(['merchant_order_id']);
            $table->dropIndex(['gateway_provider']);
            $table->dropColumn(['gateway_provider', 'gateway_merchant_id', 'merchant_order_id']);
        });

        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropIndex(['gateway_provider']);
            $table->dropColumn(['gateway_provider', 'gateway_merchant_id']);
        });
    }
};
