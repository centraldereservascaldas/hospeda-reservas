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
        if (! Schema::hasColumn('direct_booking_orders', 'gateway_provider')) {
            Schema::table('direct_booking_orders', function (Blueprint $table): void {
                $table->string('gateway_provider', 40)->default('mercadopago')->index();
            });
        }
        if (! Schema::hasColumn('direct_booking_orders', 'gateway_merchant_id')) {
            Schema::table('direct_booking_orders', function (Blueprint $table): void {
                $table->string('gateway_merchant_id', 100)->nullable();
            });
        }

        if (! Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider')) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                $table->string('gateway_provider', 40)->default('mercadopago')->index();
            });
        } elseif (! Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider'])) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                $table->index('gateway_provider');
            });
        }
        if (! Schema::hasColumn('direct_booking_payment_attempts', 'gateway_merchant_id')) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                $table->string('gateway_merchant_id', 100)->nullable();
            });
        }
        if (! Schema::hasColumn('direct_booking_payment_attempts', 'merchant_order_id')) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                $table->string('merchant_order_id', 36)->nullable()->unique();
            });
        }

        if (! Schema::hasColumn('direct_booking_payment_webhooks', 'gateway_provider')) {
            Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
                $table->string('gateway_provider', 40)->default('mercadopago')->index();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('direct_booking_payment_webhooks', 'gateway_provider')) {
            if (Schema::hasIndex('direct_booking_payment_webhooks', ['gateway_provider'])) {
                Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
                    $table->dropIndex(['gateway_provider']);
                });
            }
            Schema::table('direct_booking_payment_webhooks', function (Blueprint $table): void {
                $table->dropColumn('gateway_provider');
            });
        }

        $attemptColumnsToDrop = [];
        $laterGatewayProviderMigrationApplied = DB::table('migrations')
            ->where('migration', '2026_10_27_100001_add_gateway_provider_to_direct_booking_payment_attempts_table')
            ->exists();
        if (! $laterGatewayProviderMigrationApplied
            && Schema::hasColumn('direct_booking_payment_attempts', 'gateway_provider')) {
            if (Schema::hasIndex('direct_booking_payment_attempts', ['gateway_provider'])) {
                Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                    $table->dropIndex(['gateway_provider']);
                });
            }
            $attemptColumnsToDrop[] = 'gateway_provider';
        }
        if (Schema::hasColumn('direct_booking_payment_attempts', 'gateway_merchant_id')) {
            $attemptColumnsToDrop[] = 'gateway_merchant_id';
        }
        if (Schema::hasColumn('direct_booking_payment_attempts', 'merchant_order_id')) {
            if (Schema::hasIndex('direct_booking_payment_attempts', ['merchant_order_id'], 'unique')) {
                Schema::table('direct_booking_payment_attempts', function (Blueprint $table): void {
                    $table->dropUnique(['merchant_order_id']);
                });
            }
            $attemptColumnsToDrop[] = 'merchant_order_id';
        }
        if ($attemptColumnsToDrop !== []) {
            Schema::table('direct_booking_payment_attempts', function (Blueprint $table) use ($attemptColumnsToDrop): void {
                $table->dropColumn($attemptColumnsToDrop);
            });
        }

        $orderColumnsToDrop = [];
        if (Schema::hasColumn('direct_booking_orders', 'gateway_provider')) {
            if (Schema::hasIndex('direct_booking_orders', ['gateway_provider'])) {
                Schema::table('direct_booking_orders', function (Blueprint $table): void {
                    $table->dropIndex(['gateway_provider']);
                });
            }
            $orderColumnsToDrop[] = 'gateway_provider';
        }
        if (Schema::hasColumn('direct_booking_orders', 'gateway_merchant_id')) {
            $orderColumnsToDrop[] = 'gateway_merchant_id';
        }
        if ($orderColumnsToDrop !== []) {
            Schema::table('direct_booking_orders', function (Blueprint $table) use ($orderColumnsToDrop): void {
                $table->dropColumn($orderColumnsToDrop);
            });
        }
    }
};
