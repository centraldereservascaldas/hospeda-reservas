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
        Schema::create('affiliate_conversions', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('affiliate_user_id')->constrained('affiliate_accounts', 'user_id')->restrictOnDelete();
            $table->foreignUuid('direct_booking_order_id')->unique()->constrained('direct_booking_orders')->restrictOnDelete();
            $table->string('status', 20)->default('pending');
            $table->unsignedInteger('commission_basis_points')->nullable();
            $table->unsignedBigInteger('approved_amount_cents')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->uuid('paid_by')->nullable();
            $table->timestampTz('paid_at')->nullable();
            $table->string('payment_reference', 120)->nullable();
            $table->timestamps();
            $table->index(['affiliate_user_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('affiliate_conversions');
    }
};
