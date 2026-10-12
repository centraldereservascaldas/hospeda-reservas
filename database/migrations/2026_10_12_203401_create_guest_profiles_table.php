<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('guest_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('full_name', 160);
            $table->string('stays_client_id')->nullable()->unique();
            $table->timestampTz('stays_synced_at')->nullable();
            $table->timestamps();
        });
        DB::statement('ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_name_check CHECK (length(trim(full_name)) BETWEEN 2 AND 160)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('guest_profiles');
    }
};
