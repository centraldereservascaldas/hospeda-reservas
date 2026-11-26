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
        Schema::create('affiliate_attributions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('affiliate_user_id')->constrained('affiliate_accounts', 'user_id')->restrictOnDelete();
            $table->foreignUuid('affiliate_short_link_id')->constrained('affiliate_short_links')->restrictOnDelete();
            $table->string('listing_id', 100);
            $table->timestampTz('first_clicked_at');
            $table->timestampTz('last_clicked_at');
            $table->timestampTz('expires_at')->index();
            $table->timestamps();
            $table->index(['affiliate_user_id', 'last_clicked_at']);
        });

        Schema::create('affiliate_clicks', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('affiliate_short_link_id')->constrained('affiliate_short_links')->restrictOnDelete();
            $table->foreignUuid('affiliate_attribution_id')->constrained('affiliate_attributions')->restrictOnDelete();
            $table->timestampTz('clicked_at')->index();
            $table->timestamps();
            $table->index(['affiliate_short_link_id', 'clicked_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('affiliate_clicks');
        Schema::dropIfExists('affiliate_attributions');
    }
};
