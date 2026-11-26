<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE affiliate_accounts ADD CONSTRAINT affiliate_accounts_status_check CHECK (status IN ('pending', 'approved', 'suspended', 'rejected'))");
        DB::statement('ALTER TABLE affiliate_accounts ADD CONSTRAINT affiliate_accounts_commission_basis_points_check CHECK (commission_basis_points IS NULL OR commission_basis_points <= 10000)');
        DB::statement("ALTER TABLE affiliate_short_links ADD CONSTRAINT affiliate_short_links_status_check CHECK (status IN ('active', 'inactive'))");
        DB::statement("ALTER TABLE affiliate_conversions ADD CONSTRAINT affiliate_conversions_status_check CHECK (status IN ('pending', 'approved', 'paid'))");
        DB::statement('ALTER TABLE affiliate_conversions ADD CONSTRAINT affiliate_conversions_commission_basis_points_check CHECK (commission_basis_points IS NULL OR commission_basis_points <= 10000)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return;
        }

        DB::statement('ALTER TABLE affiliate_conversions DROP CONSTRAINT affiliate_conversions_commission_basis_points_check');
        DB::statement('ALTER TABLE affiliate_conversions DROP CONSTRAINT affiliate_conversions_status_check');
        DB::statement('ALTER TABLE affiliate_short_links DROP CONSTRAINT affiliate_short_links_status_check');
        DB::statement('ALTER TABLE affiliate_accounts DROP CONSTRAINT affiliate_accounts_commission_basis_points_check');
        DB::statement('ALTER TABLE affiliate_accounts DROP CONSTRAINT affiliate_accounts_status_check');
    }
};
