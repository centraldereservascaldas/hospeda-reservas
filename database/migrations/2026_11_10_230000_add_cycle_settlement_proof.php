<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('existing_reservation_payment_cycles', function (Blueprint $table): void {
            $table->string('settlement_proof_hash', 64)->nullable();
            $table->json('settlement_proof')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('existing_reservation_payment_cycles', function (Blueprint $table): void {
            $table->dropColumn(['settlement_proof_hash', 'settlement_proof']);
        });
    }
};
