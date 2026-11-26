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
        Schema::create('discovery_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->string('eyebrow');
            $table->text('description');
            $table->date('check_in');
            $table->date('check_out');
            $table->string('kind')->default('event'); // event, holiday, high-season
            $table->boolean('is_active')->default(true);
            $table->integer('weight')->default(5);
            $table->date('display_from')->nullable();
            $table->date('display_until')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'check_in']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('discovery_campaigns');
    }
};
