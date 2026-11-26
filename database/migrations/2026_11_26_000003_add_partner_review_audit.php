<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('partner_checkout_orders', function (Blueprint $table): void {
            $table->string('supplier_reviewed_by', 100)->nullable();
            $table->timestamp('supplier_reviewed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('partner_checkout_orders', function (Blueprint $table): void {
            $table->dropColumn(['supplier_reviewed_by', 'supplier_reviewed_at']);
        });
    }
};
