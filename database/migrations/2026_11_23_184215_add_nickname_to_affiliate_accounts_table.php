<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('affiliate_accounts', function (Blueprint $table): void {
            $table->string('nickname', 50)->nullable()->unique()->after('full_name');
        });

        DB::table('affiliate_accounts')->where('status', 'approved')->orderBy('user_id')->each(function (object $account): void {
            $base = Str::slug($account->full_name);
            $base = $base !== '' ? Str::limit($base, 40, '') : 'parceiro';
            do {
                $nickname = $base.'-'.Str::lower(Str::random(5));
            } while (DB::table('affiliate_accounts')->where('nickname', $nickname)->exists());

            DB::table('affiliate_accounts')->where('user_id', $account->user_id)->update([
                'nickname' => $nickname,
                'updated_at' => now(),
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('affiliate_accounts', function (Blueprint $table): void {
            $table->dropUnique(['nickname']);
            $table->dropColumn('nickname');
        });
    }
};
