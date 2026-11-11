<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('existing_checkout_intents', function (Blueprint $table): void {
            $table->char('payload_hmac', 64)->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('existing_checkout_intents')->whereNotNull('payload_hmac')->exists()) {
            throw new RuntimeException('Cannot remove checkout intent fingerprints while claims exist.');
        }
        Schema::table('existing_checkout_intents', function (Blueprint $table): void {
            $table->dropColumn('payload_hmac');
        });
    }
};
