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
        Schema::create('affiliate_accounts', function (Blueprint $table) {
            $table->uuid('user_id')->primary();
            $table->string('full_name', 160);
            $table->string('status', 20)->default('pending');
            $table->string('referral_code', 64)->nullable()->unique();
            $table->unsignedSmallInteger('commission_basis_points')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('affiliate_accounts');
    }
};
