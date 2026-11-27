<?php

namespace Tests\Feature;

use Database\Seeders\PropertyEditorialPilotSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PropertyEditorialPilotTest extends TestCase
{
    use RefreshDatabase;

    public function test_pilot_keeps_original_data_and_drafts_without_publishing_or_overwriting_edits(): void
    {
        $this->seed(PropertyEditorialPilotSeeder::class);
        $source = DB::table('property_editorial_sources')->where('external_id', 'imobsys-crcn-1-961')->first();
        $this->assertNotNull($source);
        $this->assertStringContainsString('#tela', $source->source_description);
        $this->assertNull($source->source_amenities);
        $this->assertDatabaseCount('property_editorial_sources', 2);
        $this->assertDatabaseCount('property_editorial_revisions', 2);
        $this->assertDatabaseHas('property_editorial_revisions', ['property_id' => $source->property_id, 'status' => 'draft', 'description_mode' => 'override']);
        $revision = DB::table('property_editorial_revisions')->where('property_id', $source->property_id)->first();
        $this->assertSame('unverified', json_decode($revision->amenities, true, 512, JSON_THROW_ON_ERROR)[0]['verification']);
        $this->assertDatabaseMissing('property_editorial_revisions', ['status' => 'published']);

        DB::table('property_editorial_revisions')->where('property_id', $source->property_id)->update(['description' => 'Edição preservada', 'description_mode' => 'override']);
        $this->seed(PropertyEditorialPilotSeeder::class);
        $this->assertDatabaseCount('property_editorial_properties', 2);
        $this->assertDatabaseHas('property_editorial_revisions', ['property_id' => $source->property_id, 'description' => 'Edição preservada']);
    }

    public function test_each_provider_identity_is_unique(): void
    {
        $this->seed(PropertyEditorialPilotSeeder::class);
        $source = DB::table('property_editorial_sources')->where('external_id', 'imobsys-crcn-1-961')->first();
        $this->expectException(QueryException::class);
        DB::table('property_editorial_sources')->insert(['property_id' => $source->property_id, 'provider' => 'imobsys', 'external_id' => 'imobsys-crcn-1-961']);
    }
}
