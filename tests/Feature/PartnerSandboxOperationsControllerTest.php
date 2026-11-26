<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Http;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\PartnerCheckoutOrder;

class PartnerSandboxOperationsControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_operations_require_an_authenticated_admin(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true]);
        $this->getJson('/api/owner/admin/partner-sandbox/orders')->assertUnauthorized();
        $this->postJson('/api/owner/admin/partner-sandbox/orders/123/manual-payment', ['amountCents' => 100, 'reference' => 'TEST'])->assertUnauthorized();
    }

    public function test_owner_reviewer_cannot_access_partner_payment_operations(): void
    {
        config([
            'services.partner_checkout_sandbox.enabled' => true,
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.hospeda.owner_admin_emails' => ['admin@example.test'],
            'services.hospeda.owner_reviewer_emails' => ['reviewer@example.test'],
        ]);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => '575c8054-6646-443c-bf62-07945019a32f',
            'email' => 'reviewer@example.test',
            'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Pessoa Teste'],
        ])]);

        $this->withToken('valid-access-token')->getJson('/api/owner/admin/partner-sandbox/orders')
            ->assertForbidden();
        $this->withToken('valid-access-token')->postJson('/api/owner/admin/partner-sandbox/orders/123/manual-payment', [
            'amountCents' => 100, 'reference' => 'TEST',
        ])->assertForbidden();
    }

    public function test_admin_can_find_paid_order_and_record_supplier_payment_once(): void
    {
        config([
            'services.partner_checkout_sandbox.enabled' => true,
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.hospeda.owner_admin_emails' => ['admin@example.test'],
        ]);
        Http::fake(['*/auth/v1/user' => Http::response([
            'id' => '575c8054-6646-443c-bf62-07945019a32f',
            'email' => 'admin@example.test',
            'email_confirmed_at' => '2026-01-01T00:00:00Z',
            'user_metadata' => ['full_name' => 'Pessoa Teste'],
        ])]);
        $order = PartnerCheckoutOrder::create([
            'public_reference' => str_repeat('X', 40), 'supplier_property_id' => 'imobsys-crcn-2-663',
            'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2,
            'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL',
            'status' => 'awaiting_seller_payment', 'payment_id' => 'PAY1',
            'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_reference' => '1600',
            'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste'],
        ]);

        $this->withToken('admin-token')->getJson('/api/owner/admin/partner-sandbox/orders')
            ->assertOk()->assertJsonPath('orders.0.reservation_reference', '1600')
            ->assertJsonMissingPath('orders.0.encrypted_customer');
        $url = '/api/owner/admin/partner-sandbox/orders/'.$order->id.'/manual-payment';
        $this->withToken('admin-token')->postJson($url, ['amountCents' => 52300, 'reference' => 'TEST-1'])
            ->assertOk()->assertJsonPath('status', 'supplier_payment_recorded');
        $this->withToken('admin-token')->postJson($url, ['amountCents' => 52300, 'reference' => 'TEST-1'])
            ->assertStatus(409);
        $this->assertDatabaseHas('partner_checkout_orders', [
            'id' => $order->id, 'supplier_paid_by' => 'admin@example.test',
            'supplier_paid_cents' => 52300, 'supplier_payment_reference' => 'TEST-1',
        ]);
    }

    public function test_operations_paginates_and_prioritizes_orders_requiring_attention(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Pessoa Teste']])]);
        $base = ['supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'payment_method' => 'pix', 'encrypted_customer' => ['fullName' => 'Teste']];
        for ($i = 0; $i < 50; $i++) {
            PartnerCheckoutOrder::create([...$base, 'public_reference' => str_pad((string) $i, 40, 'A'), 'merchant_order_id' => 'ORDER'.$i, 'reservation_idempotency_key' => 'partner-order-'.str_pad((string) $i, 10, '0', STR_PAD_LEFT), 'status' => 'awaiting_seller_payment']);
        }
        $attention = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('Z', 40), 'merchant_order_id' => 'ATTENTION', 'reservation_idempotency_key' => 'partner-order-attention', 'status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown']);
        $url = '/api/owner/admin/partner-sandbox/orders';
        $this->withToken('admin-token')->getJson($url)->assertOk()->assertJsonCount(50, 'orders')->assertJsonPath('orders.0.id', $attention->id)->assertJsonPath('nextPage', 2);
        $this->withToken('admin-token')->getJson($url.'?page=2')->assertOk()->assertJsonCount(1, 'orders')->assertJsonPath('nextPage', null);
        $this->withToken('admin-token')->getJson($url.'?page=0')->assertUnprocessable();
    }
}
