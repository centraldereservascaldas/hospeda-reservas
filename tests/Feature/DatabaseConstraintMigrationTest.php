<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DatabaseConstraintMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_sqlite_guest_profile_name_constraint_rejects_invalid_names_on_insert_and_update(): void
    {
        $this->assertSame('sqlite', DB::connection()->getDriverName());

        DB::table('guest_profiles')->insert([
            'id' => 'a345ab99-747c-490f-87c6-4153883ccf37',
            'full_name' => 'Valid Name',
        ]);

        try {
            DB::table('guest_profiles')->insert([
                'id' => 'b345ab99-747c-490f-87c6-4153883ccf37',
                'full_name' => '  ',
            ]);

            $this->fail('SQLite should reject guest profile names shorter than two trimmed characters.');
        } catch (QueryException) {
            $this->assertDatabaseMissing('guest_profiles', ['id' => 'b345ab99-747c-490f-87c6-4153883ccf37']);
        }

        try {
            DB::table('guest_profiles')
                ->where('id', 'a345ab99-747c-490f-87c6-4153883ccf37')
                ->update(['full_name' => str_repeat('A', 161)]);

            $this->fail('SQLite should reject guest profile names longer than 160 characters.');
        } catch (QueryException) {
            $this->assertDatabaseHas('guest_profiles', [
                'id' => 'a345ab99-747c-490f-87c6-4153883ccf37',
                'full_name' => 'Valid Name',
            ]);
        }
    }

    public function test_sqlite_owner_access_constraints_reject_invalid_status_and_approved_access_without_owner_id(): void
    {
        $this->assertSame('sqlite', DB::connection()->getDriverName());

        DB::table('owner_access')->insert([
            'user_id' => 'a345ab99-747c-490f-87c6-4153883ccf38',
            'full_name' => 'Valid Owner',
            'status' => 'pending',
        ]);

        try {
            DB::table('owner_access')->insert([
                'user_id' => 'b345ab99-747c-490f-87c6-4153883ccf38',
                'full_name' => 'Invalid Status',
                'status' => 'unknown',
            ]);

            $this->fail('SQLite should reject owner access statuses outside the allowed values.');
        } catch (QueryException) {
            $this->assertDatabaseMissing('owner_access', ['user_id' => 'b345ab99-747c-490f-87c6-4153883ccf38']);
        }

        try {
            DB::table('owner_access')
                ->where('user_id', 'a345ab99-747c-490f-87c6-4153883ccf38')
                ->update(['status' => 'approved']);

            $this->fail('SQLite should reject approved owner access without a Stays owner ID.');
        } catch (QueryException) {
            $this->assertDatabaseHas('owner_access', [
                'user_id' => 'a345ab99-747c-490f-87c6-4153883ccf38',
                'status' => 'pending',
            ]);
        }
    }
}
