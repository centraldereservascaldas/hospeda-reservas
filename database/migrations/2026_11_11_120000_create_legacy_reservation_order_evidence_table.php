<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legacy_reservation_order_evidence', function (Blueprint $table): void {
            $table->uuid('direct_booking_order_id')->primary();
            $table->string('reservation_reference', 5);
            $table->char('canonical_id', 24)->index();
            $table->char('account_fingerprint', 64);
            $table->char('order_snapshot_hash', 64);
            $table->timestamp('created_at');
            $table->foreign('direct_booking_order_id')->references('id')->on('direct_booking_orders');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legacy_reservation_order_evidence');
    }
};
