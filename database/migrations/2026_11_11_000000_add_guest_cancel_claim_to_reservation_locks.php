<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('existing_reservation_payment_locks', function (Blueprint $table): void {
            $table->timestamp('guest_cancel_claimed_at')->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('existing_reservation_payment_locks')->whereNotNull('guest_cancel_claimed_at')->exists()) {
            throw new \RuntimeException('Guest cancellation claims must be reconciled before rolling back this migration.');
        }
        Schema::table('existing_reservation_payment_locks', function (Blueprint $table): void {
            $table->dropColumn('guest_cancel_claimed_at');
        });
    }
};
