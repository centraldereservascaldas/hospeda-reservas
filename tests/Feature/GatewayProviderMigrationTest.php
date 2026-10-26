<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class GatewayProviderMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_payment_records_keep_their_data_and_use_mercado_pago_provider_default(): void
    {
        $orderId = (string) Str::uuid();
        $attemptId = (string) Str::uuid();
        $now = now();

        DB::table('direct_booking_orders')->insert([
            'id' => $orderId,
            'idempotency_key' => 'legacy-order-key',
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'listing-1',
            'stays_listing_id' => 'stays-1',
            'check_in' => '2026-11-01',
            'check_out' => '2026-11-02',
            'guests' => '[]',
            'guest_name' => 'Existing Guest',
            'guest_email' => 'guest@example.test',
            'guest_phone' => '+5511999999999',
            'quote_total' => '100.00',
            'currency' => 'BRL',
            'quote_snapshot' => '{}',
            'accepted_terms_version' => 'v1',
            'accepted_terms_snapshot' => '{}',
            'terms_accepted_at' => $now,
            'operational_events' => '[]',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('direct_booking_payment_attempts')->insert([
            'id' => $attemptId,
            'direct_booking_order_id' => $orderId,
            'idempotency_key' => 'legacy-attempt-key',
            'request_fingerprint' => str_repeat('b', 64),
            'payment_method' => 'pix',
            'payment_method_id' => 'pix',
            'status' => 'pending',
            'amount' => '100.00',
            'currency' => 'BRL',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('direct_booking_payment_webhooks')->insert([
            'id' => (string) Str::uuid(),
            'event_key' => str_repeat('c', 64),
            'gateway_payment_id' => 'legacy-payment-id',
            'received_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->assertDatabaseHas('direct_booking_orders', [
            'id' => $orderId,
            'guest_email' => 'guest@example.test',
            'gateway_provider' => 'mercadopago',
        ]);
        $this->assertDatabaseHas('direct_booking_payment_attempts', [
            'id' => $attemptId,
            'amount' => '100.00',
            'gateway_provider' => 'mercadopago',
        ]);
        $this->assertDatabaseHas('direct_booking_payment_webhooks', [
            'event_key' => str_repeat('c', 64),
            'gateway_provider' => 'mercadopago',
        ]);
    }
}
