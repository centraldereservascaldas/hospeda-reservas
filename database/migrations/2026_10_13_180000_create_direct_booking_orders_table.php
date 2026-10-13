<?php

use App\Enums\DirectBookingOrderStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('direct_booking_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('status')->default(DirectBookingOrderStatus::Iniciado->value)->index();
            $table->string('idempotency_key', 128)->unique();
            $table->char('request_fingerprint', 64);
            $table->string('listing_id', 100)->index();
            $table->string('stays_listing_id', 100)->index();
            $table->date('check_in');
            $table->date('check_out');
            $table->json('guests');
            $table->string('guest_name', 180);
            $table->string('guest_email', 254)->index();
            $table->string('guest_phone', 40);
            $table->decimal('quote_total', 12, 2);
            $table->char('currency', 3);
            $table->json('quote_snapshot');
            $table->string('accepted_terms_version', 100);
            $table->json('accepted_terms_snapshot');
            $table->timestampTz('terms_accepted_at');
            $table->string('origin', 40)->default('website');
            $table->timestampTz('expires_at')->nullable()->index();
            $table->string('stays_reservation_id', 100)->nullable()->unique();
            $table->string('gateway_payment_id', 150)->nullable()->unique();
            $table->string('payment_status', 40)->nullable()->index();
            $table->decimal('payment_amount', 12, 2)->nullable();
            $table->string('payment_currency', 3)->nullable();
            $table->string('payment_method', 40)->nullable();
            $table->string('payment_detail', 100)->nullable();
            $table->string('payment_status_detail', 100)->nullable();
            $table->timestampTz('payment_expires_at')->nullable();
            $table->timestampTz('paid_at')->nullable()->index();
            $table->text('payment_qr_code')->nullable();
            $table->json('operational_events');
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('direct_booking_orders');
    }
};
