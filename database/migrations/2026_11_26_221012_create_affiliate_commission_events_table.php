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
        Schema::create('affiliate_commission_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('affiliate_conversion_id')->constrained('affiliate_conversions')->restrictOnDelete();
            $table->uuid('actor_user_id');
            $table->string('event_type', 40);
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20)->nullable();
            $table->json('evidence');
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['affiliate_conversion_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('affiliate_commission_events');
    }
};
