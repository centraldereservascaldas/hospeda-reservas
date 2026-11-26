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
        Schema::create('affiliate_short_links', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('affiliate_user_id')->constrained('affiliate_accounts', 'user_id')->restrictOnDelete();
            $table->string('token', 32)->unique();
            $table->string('listing_id', 100);
            $table->string('status', 20)->default('active');
            $table->timestamps();
            $table->unique(['affiliate_user_id', 'listing_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('affiliate_short_links');
    }
};
