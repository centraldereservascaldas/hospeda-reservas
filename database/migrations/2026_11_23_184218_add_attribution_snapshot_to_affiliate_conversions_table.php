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
        Schema::table('affiliate_conversions', function (Blueprint $table): void {
            $table->foreignUuid('affiliate_short_link_id')->nullable()->constrained('affiliate_short_links')->restrictOnDelete();
            $table->foreignUuid('affiliate_attribution_id')->nullable()->constrained('affiliate_attributions')->restrictOnDelete();
            $table->string('listing_id', 100)->nullable();
            $table->timestampTz('attributed_at')->nullable();
            $table->timestampTz('last_clicked_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('affiliate_conversions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('affiliate_attribution_id');
            $table->dropConstrainedForeignId('affiliate_short_link_id');
            $table->dropColumn(['listing_id', 'attributed_at', 'last_clicked_at']);
        });
    }
};
