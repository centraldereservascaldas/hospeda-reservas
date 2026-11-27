<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_editorial_properties', function (Blueprint $table): void {
            $table->id();
            $table->string('internal_label');
            $table->timestamps();
        });
        Schema::create('property_editorial_sources', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('property_id')->constrained('property_editorial_properties')->restrictOnDelete();
            $table->string('provider', 40);
            $table->string('external_id', 120);
            $table->text('source_title')->nullable();
            $table->text('source_description')->nullable();
            $table->json('source_amenities')->nullable();
            $table->timestampTz('observed_at')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'external_id']);
            $table->index(['property_id', 'provider']);
        });
        Schema::create('property_editorial_revisions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('property_id')->constrained('property_editorial_properties')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->enum('status', ['draft', 'in_review', 'approved', 'published', 'archived'])->default('draft');
            $table->enum('title_mode', ['inherit', 'override', 'hide'])->default('inherit');
            $table->text('title')->nullable();
            $table->enum('description_mode', ['inherit', 'override', 'hide'])->default('inherit');
            $table->text('description')->nullable();
            $table->enum('amenities_mode', ['inherit', 'override', 'hide'])->default('inherit');
            $table->json('amenities')->nullable();
            $table->string('created_by', 150);
            $table->string('reviewed_by', 150)->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->string('published_by', 150)->nullable();
            $table->timestampTz('published_at')->nullable();
            $table->text('change_note')->nullable();
            $table->timestamps();
            $table->unique(['property_id', 'version']);
            $table->index(['property_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_editorial_revisions');
        Schema::dropIfExists('property_editorial_sources');
        Schema::dropIfExists('property_editorial_properties');
    }
};
