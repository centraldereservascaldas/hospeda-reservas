<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Http;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\PartnerCheckoutOrder;
use App\Services\ImobSysPreReservationClient;

class PartnerSandboxOperationsControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_operations_require_an_authenticated_admin(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true]);
        $this->getJson('/api/owner/admin/partner-sandbox/orders')->assertUnauthorized();
        $this->postJson('/api/owner/admin/partner-sandbox/orders/123/manual-payment', ['amountCents' => 100, 'reference' => 'TEST'])->assertUnauthorized();
        $this->getJson('/api/owner/admin/partner-sandbox/orders/123/supplier-status')->assertUnauthorized();
        $this->postJson('/api/owner/admin/partner-sandbox/orders/123/supplier-review')->assertUnauthorized();
    }

    public function test_admin_can_read_uncertain_supplier_operation_without_mutating_it(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test'], 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.reservation_key' => 'reservation-secret', 'services.partner_api.reservations_enabled' => true]);
        $operation = '123e4567-e89b-42d3-a456-426614174000';
        Http::fake([
            '*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Pessoa Teste']]),
            'api.example.test/*' => Http::response(['success' => true, 'data' => ['operationId' => $operation, 'state' => 'unknown', 'propertyId' => 'imobsys-crcn-2-663', 'from' => '2027-05-17', 'to' => '2027-05-19', 'guests' => 2, 'partnerStatus' => 'unknown', 'reservationReference' => '1600']]),
        ]);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('Q', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown', 'supplier_operation_id' => $operation, 'payment_id' => 'PAY1', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->withToken('admin-token')->getJson('/api/owner/admin/partner-sandbox/orders/'.$order->id.'/supplier-status')->assertOk()->assertJsonPath('state', 'unknown')->assertJsonPath('reservationReference', '1600')->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame('attention_required', $order->fresh()->status);
        Http::assertSent(fn ($request): bool => $request->method() === 'GET' && str_contains($request->url(), '/v1/pre-reservations/'));
        $order->update(['supplier_operation_id' => null]);
        $this->withToken('admin-token')->getJson('/api/owner/admin/partner-sandbox/orders/'.$order->id.'/supplier-status')->assertOk()->assertJsonPath('state', 'unknown');
        Http::assertSent(fn ($request): bool => $request->method() === 'GET' && str_ends_with($request->url(), '/v1/pre-reservations/by-key') && $request->hasHeader('Idempotency-Key', 'partner-order-123456'));
    }

    public function test_read_only_review_rejects_an_operation_with_a_different_amount(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Pessoa Teste']])]);
        $operation = '123e4567-e89b-42d3-a456-426614174000';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('V', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown', 'supplier_operation_id' => $operation, 'payment_id' => 'PAY2', 'merchant_order_id' => 'ORDER2', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123457', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(ImobSysPreReservationClient::class)->shouldReceive('lookup')->once()->with($operation)->andReturn(['state' => 'created', 'propertyId' => 'imobsys-crcn-2-663', 'from' => '2027-05-17', 'to' => '2027-05-19', 'guests' => 2, 'amountCents' => 52400]);
        $this->withToken('admin-token')->getJson('/api/owner/admin/partner-sandbox/orders/'.$order->id.'/supplier-status')->assertStatus(503);
        $this->assertSame('attention_required', $order->fresh()->status);
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
        $this->withToken('valid-access-token')->getJson('/api/owner/admin/partner-sandbox/orders/123/supplier-status')->assertForbidden();
        $this->withToken('valid-access-token')->postJson('/api/owner/admin/partner-sandbox/orders/123/supplier-review')->assertForbidden();
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
            ->assertJsonPath('orders.0.payment_method', 'pix')->assertJsonPath('orders.0.payment_cents', 52300)
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

    public function test_admin_review_requires_exact_observed_details_and_is_audited_once(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Pessoa Teste']])]);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('R', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown', 'reservation_reference' => '1600', 'payment_id' => 'PAY1', 'merchant_order_id' => 'ORDERREVIEW', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-review', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $url = '/api/owner/admin/partner-sandbox/orders/'.$order->id.'/supplier-review';
        $input = ['reference' => '1600', 'propertyId' => 'imobsys-crcn-2-663', 'from' => '2027-05-17', 'to' => '2027-05-19', 'guests' => 2, 'baseCents' => 52300, 'confirmed' => true];
        $order->update(['payment_id' => null]);
        $this->withToken('admin-token')->postJson($url, $input)->assertStatus(409);
        $order->update(['payment_id' => 'PAY1']);
        config(['services.cielo.direct_environment' => 'production']);
        $this->withToken('admin-token')->postJson($url, $input)->assertStatus(409);
        config(['services.cielo.direct_environment' => 'sandbox']);
        foreach ([['reference' => '1601'], ['propertyId' => 'imobsys-crcn-2-664'], ['from' => '2027-05-18'], ['to' => '2027-05-20'], ['guests' => 3], ['baseCents' => 52301], ['confirmed' => false]] as $difference) {
            $this->withToken('admin-token')->postJson($url, [...$input, ...$difference])->assertStatus(409);
            $this->assertSame('attention_required', $order->fresh()->status);
        }
        $this->withToken('admin-token')->postJson($url, $input)->assertOk()->assertJsonPath('status', 'awaiting_seller_payment');
        $this->assertSame('admin@example.test', $order->fresh()->supplier_reviewed_by);
        $this->assertNotNull($order->fresh()->supplier_reviewed_at);
        $this->withToken('admin-token')->postJson($url, $input)->assertStatus(409);
        $this->withToken('admin-token')->getJson('/api/owner/admin/partner-sandbox/orders')->assertOk()->assertJsonPath('orders.0.id', $order->id)->assertJsonPath('orders.0.reservation_reference', '1600');
        $paymentUrl = '/api/owner/admin/partner-sandbox/orders/'.$order->id.'/manual-payment';
        $this->withToken('admin-token')->postJson($paymentUrl, ['amountCents' => 41800, 'reference' => 'MANUAL-TEST'])->assertOk();
        $this->assertSame('supplier_payment_recorded', $order->fresh()->status);
        $this->assertSame('admin@example.test', $order->fresh()->supplier_reviewed_by);
        $this->assertSame('admin@example.test', $order->fresh()->supplier_paid_by);
        $this->assertSame(41800, (int) $order->fresh()->supplier_paid_cents);
        $this->withToken('admin-token')->postJson($paymentUrl, ['amountCents' => 41800, 'reference' => 'MANUAL-TEST'])->assertStatus(409);
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

    public function test_paid_order_is_visible_before_supplier_creation_starts(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        Http::fake(['*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'admin@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Pessoa Teste']])]);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('P', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_verified', 'payment_id' => 'PAY1', 'merchant_order_id' => 'ORDERVISIBLE', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-visible', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->withToken('admin-token')->getJson('/api/owner/admin/partner-sandbox/orders')->assertOk()->assertJsonPath('orders.0.id', $order->id)->assertJsonPath('orders.0.status', 'payment_verified');
        $this->assertNull($order->fresh()->reservation_reference);
    }
}
