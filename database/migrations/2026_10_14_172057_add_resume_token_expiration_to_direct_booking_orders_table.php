<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $hasExpirationColumn = Schema::hasColumn('direct_booking_orders', 'resume_token_expires_at');
        $legacyTokenQuery = DB::table('direct_booking_orders')->whereNotNull('resume_token');

        if ($hasExpirationColumn) {
            $legacyTokenQuery->whereNull('resume_token_expires_at');
        }

        $legacyTokens = $legacyTokenQuery->exists();
        $resumeTokenTtlDays = filter_var(config('direct-booking.resume_token_ttl_days'), FILTER_VALIDATE_INT);

        if ($legacyTokens && (! is_int($resumeTokenTtlDays) || $resumeTokenTtlDays < 1)) {
            throw new RuntimeException(
                'Set an approved positive DIRECT_BOOKING_RESUME_TOKEN_TTL_DAYS value before migrating existing checkout resume tokens.',
            );
        }

        if (! $hasExpirationColumn) {
            Schema::table('direct_booking_orders', function (Blueprint $table): void {
                $table->timestampTz('resume_token_expires_at')->nullable()->after('resume_token')->index();
            });
        }

        if (! $legacyTokens || ! is_int($resumeTokenTtlDays)) {
            return;
        }

        DB::table('direct_booking_orders')
            ->select(['id', 'created_at'])
            ->whereNotNull('resume_token')
            ->whereNull('resume_token_expires_at')
            ->orderBy('id')
            ->chunkById(100, function (Collection $orders) use ($resumeTokenTtlDays): void {
                foreach ($orders as $order) {
                    DB::table('direct_booking_orders')
                        ->where('id', $order->id)
                        ->update([
                            'resume_token_expires_at' => Carbon::parse($order->created_at)
                                ->addDays($resumeTokenTtlDays),
                        ]);
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // SQLite requires the column index to be removed first; legacy schemas may not have it.
        if (method_exists(Schema::getFacadeRoot(), 'hasIndex')
            && Schema::hasIndex('direct_booking_orders', ['resume_token_expires_at'])) {
            Schema::table('direct_booking_orders', function (Blueprint $table): void {
                $table->dropIndex(['resume_token_expires_at']);
            });
        }

        Schema::table('direct_booking_orders', function (Blueprint $table): void {
            $table->dropColumn('resume_token_expires_at');
        });
    }
};
