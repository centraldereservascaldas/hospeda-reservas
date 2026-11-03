<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::unprepared('DROP TRIGGER owner_access_constraints_insert');
            DB::unprepared('DROP TRIGGER owner_access_constraints_update');
            DB::unprepared("CREATE TRIGGER owner_access_constraints_insert BEFORE INSERT ON owner_access WHEN NEW.status NOT IN ('pending', 'approved', 'suspended', 'rejected') OR (NEW.status = 'approved' AND NEW.stays_owner_id IS NULL) BEGIN SELECT RAISE(ABORT, 'owner_access_constraints_check'); END");
            DB::unprepared("CREATE TRIGGER owner_access_constraints_update BEFORE UPDATE OF status, stays_owner_id ON owner_access WHEN NEW.status NOT IN ('pending', 'approved', 'suspended', 'rejected') OR (NEW.status = 'approved' AND NEW.stays_owner_id IS NULL) BEGIN SELECT RAISE(ABORT, 'owner_access_constraints_check'); END");

            return;
        }

        DB::statement('ALTER TABLE owner_access DROP CONSTRAINT owner_access_status_check');
        DB::statement("ALTER TABLE owner_access ADD CONSTRAINT owner_access_status_check CHECK (status IN ('pending', 'approved', 'suspended', 'rejected'))");
    }

    public function down(): void
    {
        DB::table('owner_access')->where('status', 'rejected')->update(['status' => 'suspended']);
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::unprepared('DROP TRIGGER owner_access_constraints_insert');
            DB::unprepared('DROP TRIGGER owner_access_constraints_update');
            DB::unprepared("CREATE TRIGGER owner_access_constraints_insert BEFORE INSERT ON owner_access WHEN NEW.status NOT IN ('pending', 'approved', 'suspended') OR (NEW.status = 'approved' AND NEW.stays_owner_id IS NULL) BEGIN SELECT RAISE(ABORT, 'owner_access_constraints_check'); END");
            DB::unprepared("CREATE TRIGGER owner_access_constraints_update BEFORE UPDATE OF status, stays_owner_id ON owner_access WHEN NEW.status NOT IN ('pending', 'approved', 'suspended') OR (NEW.status = 'approved' AND NEW.stays_owner_id IS NULL) BEGIN SELECT RAISE(ABORT, 'owner_access_constraints_check'); END");

            return;
        }

        DB::statement('ALTER TABLE owner_access DROP CONSTRAINT owner_access_status_check');
        DB::statement("ALTER TABLE owner_access ADD CONSTRAINT owner_access_status_check CHECK (status IN ('pending', 'approved', 'suspended'))");
    }
};
