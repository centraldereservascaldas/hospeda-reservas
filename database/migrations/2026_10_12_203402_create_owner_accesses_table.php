<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('owner_access', function (Blueprint $table) {
            $table->uuid('user_id')->primary();
            $table->string('full_name', 160);
            $table->string('stays_owner_id')->nullable()->unique();
            $table->string('status', 20)->default('pending');
            $table->timestampTz('approved_at')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index(['reviewed_by', 'reviewed_at']);
        });
        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared("CREATE TRIGGER owner_access_constraints_insert BEFORE INSERT ON owner_access WHEN NEW.status NOT IN ('pending', 'approved', 'suspended') OR (NEW.status = 'approved' AND NEW.stays_owner_id IS NULL) BEGIN SELECT RAISE(ABORT, 'owner_access_constraints_check'); END");
            DB::unprepared("CREATE TRIGGER owner_access_constraints_update BEFORE UPDATE OF status, stays_owner_id ON owner_access WHEN NEW.status NOT IN ('pending', 'approved', 'suspended') OR (NEW.status = 'approved' AND NEW.stays_owner_id IS NULL) BEGIN SELECT RAISE(ABORT, 'owner_access_constraints_check'); END");

            return;
        }

        DB::statement("ALTER TABLE owner_access ADD CONSTRAINT owner_access_status_check CHECK (status IN ('pending', 'approved', 'suspended'))");
        DB::statement("ALTER TABLE owner_access ADD CONSTRAINT owner_access_approved_owner_check CHECK ((status = 'approved' AND stays_owner_id IS NOT NULL) OR status <> 'approved')");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('owner_access');
    }
};
