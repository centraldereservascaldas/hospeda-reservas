<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('existing_checkout_intents', function (Blueprint $table): void {
            $table->char('key_hash', 64)->primary();
            $table->string('state', 16);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('existing_checkout_intents');
    }
};
