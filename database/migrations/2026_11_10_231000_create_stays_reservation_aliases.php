<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stays_reservation_aliases', function (Blueprint $table): void {
            $table->char('canonical_id', 24)->primary();
            $table->char('reservation_code', 5)->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stays_reservation_aliases');
    }
};
