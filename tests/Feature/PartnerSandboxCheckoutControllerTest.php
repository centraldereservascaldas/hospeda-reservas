<?php

namespace Tests\Feature;

use App\Jobs\CompletePartnerCheckout;
use App\Models\PartnerCheckoutOrder;
use App\Services\Payments\CieloSilentOrderPostClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PartnerSandboxCheckoutControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_is_unavailable_when_flag_is_disabled(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => false]);
        $this->postJson('/api/partner-sandbox/checkout', [])->assertNotFound();
        $this->postJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40).'/payment', [])->assertNotFound();
        $this->getJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40))->assertNotFound();
    }

    public function test_status_omits_customer_and_internal_payment_identifiers(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.cielo.direct_environment' => 'sandbox']);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('A', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => 'PAY1', 'payment_qr_code' => 'PIX-TESTE', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Pessoa Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $response = $this->getJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40))->assertOk()->assertJsonPath('status', 'payment_pending')->assertJsonPath('pix', 'PIX-TESTE')->assertHeader('Cache-Control', 'no-store, private');
        $this->assertStringNotContainsString('12345678901', $response->getContent());
        $this->assertStringNotContainsString('PAY1', $response->getContent());
        $this->travel(31)->minutes();
        $this->getJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40))->assertOk()->assertJsonPath('pix', null);
        $this->travelBack();
        Queue::fake();
        $this->postJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40).'/reconcile')->assertAccepted();
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $order->id);
        $order->update(['status' => 'payment_verified']);
        $this->getJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40))->assertOk()->assertJsonPath('pix', null);
    }

    public function test_card_token_is_only_issued_for_an_active_card_order_in_sandbox(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.cielo.direct_environment' => 'sandbox']);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('B', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 55636, 'currency' => 'BRL', 'status' => 'quoted', 'merchant_order_id' => 'ORDER2', 'payment_method' => 'card', 'installments' => 1, 'reservation_idempotency_key' => 'partner-order-123457', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloSilentOrderPostClient::class)->shouldReceive('createBrowserAccessToken')->once()->andReturn('sandbox-browser-token');
        $url = '/api/partner-sandbox/checkout/'.str_repeat('B', 40).'/card-token';
        $this->postJson($url)->assertOk()->assertJsonPath('environment', 'sandbox')->assertJsonPath('accessToken', 'sandbox-browser-token')->assertHeader('Cache-Control', 'no-store, private');
        $order->update(['status' => 'payment_pending']);
        $this->postJson($url)->assertStatus(409);
        $order->update(['status' => 'quoted', 'payment_method' => 'pix']);
        $this->postJson($url)->assertStatus(409);
        config(['services.partner_checkout_sandbox.enabled' => false]);
        $this->postJson($url)->assertNotFound();
    }

    public function test_late_payment_id_can_be_reconciled_without_repeating_supplier_requests(): void
    {
        config(['services.partner_checkout_sandbox.enabled' => true, 'services.cielo.direct_environment' => 'sandbox']);
        Queue::fake();
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('C', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'payment_outcome_unknown', 'payment_id' => 'PAYLATE', 'merchant_order_id' => 'ORDERL', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-late', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $url = '/api/partner-sandbox/checkout/'.str_repeat('C', 40).'/reconcile';
        $this->postJson($url)->assertAccepted();
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $order->id);
        Queue::fake();
        $order->update(['attention_reason' => 'supplier_outcome_unknown']);
        $this->postJson($url)->assertAccepted();
        Queue::assertNothingPushed();
    }
}
