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
        Schema::create('condominium_slug_registry', function (Blueprint $table) {
            $table->id();
            $table->string('account_key', 64);
            $table->string('property_id', 80);
            $table->string('slug', 191);
            $table->boolean('canonical')->default(false);
            $table->timestamps();
            $table->unique(['account_key', 'slug']);
            $table->index(['account_key', 'property_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('condominium_slug_registry');
    }
};
