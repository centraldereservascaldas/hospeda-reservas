<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('existing_reservation_payment_locks', function (Blueprint $table): void {
            $table->uuid('release_order_id')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('existing_reservation_payment_locks', function (Blueprint $table): void {
            $table->dropColumn('release_order_id');
        });
    }
};
