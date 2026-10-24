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
        Schema::create('stays_simulator_calendar_days', function (Blueprint $table): void {
            $table->id();
            $table->string('listing_id');
            $table->date('date');
            $table->boolean('available')->default(true);
            $table->decimal('daily_rate', 10, 2);
            $table->unsignedSmallInteger('min_stay')->default(1);
            $table->boolean('closed_to_arrival')->default(false);
            $table->boolean('closed_to_departure')->default(false);
            $table->timestamps();
            $table->unique(['listing_id', 'date']);
            $table->foreign('listing_id')->references('listing_id')->on('stays_simulator_listings')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stays_simulator_calendar_days');
    }
};
