<?php

namespace Tests\Feature;

use App\Jobs\CompletePartnerCheckout;
use App\Models\PartnerCheckoutOrder;
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
        Queue::fake();
        $this->postJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40).'/reconcile')->assertAccepted();
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $order->id);
        $order->update(['status' => 'payment_verified']);
        $this->getJson('/api/partner-sandbox/checkout/'.str_repeat('A', 40))->assertOk()->assertJsonPath('pix', null);
    }
}
