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
        Schema::table('affiliate_attributions', function (Blueprint $table): void {
            $table->index('affiliate_short_link_id');
        });

        Schema::table('affiliate_clicks', function (Blueprint $table): void {
            $table->index('affiliate_attribution_id');
        });

        Schema::table('affiliate_conversions', function (Blueprint $table): void {
            $table->index(['created_at', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('affiliate_conversions', function (Blueprint $table): void {
            $table->dropIndex(['created_at', 'id']);
        });

        Schema::table('affiliate_clicks', function (Blueprint $table): void {
            $table->dropIndex(['affiliate_attribution_id']);
        });

        Schema::table('affiliate_attributions', function (Blueprint $table): void {
            $table->dropIndex(['affiliate_short_link_id']);
        });
    }
};
