<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->decimal('base_amount', 12, 2)->nullable()->after('amount');
            $table->decimal('processing_fee_amount', 12, 2)->nullable()->after('base_amount');
            $table->unsignedSmallInteger('processing_fee_basis_points')->nullable()->after('processing_fee_amount');
        });
    }

    public function down(): void
    {
        Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
            $table->dropColumn(['base_amount', 'processing_fee_amount', 'processing_fee_basis_points']);
        });
    }
};
