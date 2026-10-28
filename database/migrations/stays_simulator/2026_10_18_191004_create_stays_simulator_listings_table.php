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
        Schema::create('stays_simulator_listings', function (Blueprint $table): void {
            $table->string('listing_id')->primary();
            $table->json('property_data');
            $table->decimal('daily_rate', 10, 2);
            $table->decimal('cleaning_fee', 10, 2)->default(0);
            $table->decimal('service_fee_rate', 5, 4)->default(0);
            $table->unsignedSmallInteger('max_guests');
            $table->boolean('active')->default(true)->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stays_simulator_listings');
    }
};
