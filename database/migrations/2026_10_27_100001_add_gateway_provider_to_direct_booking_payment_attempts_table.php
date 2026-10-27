<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->string('gateway_provider', 30)->default('mercadopago')->after('gateway_payment_id');
        });
    }

    public function down(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->dropColumn('gateway_provider');
        });
    }
};
