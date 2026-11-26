<?php

namespace Tests\Feature;

use App\Models\PartnerCheckoutOrder;
use App\Services\ImobSysSearchClient;
use App\Services\PartnerPaymentStartService;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class PartnerPaymentStartServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_start_is_persisted_and_cannot_be_submitted_twice(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('F', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'quoted', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->once()->with('2027-05-17', '2027-05-19', 2, '', 'imobsys-crcn-2-663', true)->andReturn([['totalCents' => 52300, '_crcnGuestCountVerified' => true, 'additionalChargesKnown' => true]]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('createPixPayment')->once()->andReturn(['Payment' => ['PaymentId' => '11111111-1111-4111-8111-111111111111', 'QrCodeString' => 'PIX-TESTE']]);
        $service = app(PartnerPaymentStartService::class);
        $service->start($order->id);
        $this->assertSame('payment_pending', $order->fresh()->status);
        $this->expectException(RuntimeException::class);
        $service->start($order->id);
    }

    public function test_changed_quote_does_not_contact_cielo(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('F', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'quoted', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->once()->andReturn([['totalCents' => 52400]]);
        $this->mock(CieloEcommerceClient::class)->shouldNotReceive('createPixPayment');
        try {
            app(PartnerPaymentStartService::class)->start($order->id);
            $this->fail('Changed quote must not start payment.');
        } catch (RuntimeException) {
            $this->assertSame('quote_unavailable', $order->fresh()->status);
        }
    }

    public function test_gateway_failure_requires_review_and_cannot_be_retried(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('F', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'quoted', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->once()->andReturn([['totalCents' => 52300, '_crcnGuestCountVerified' => true, 'additionalChargesKnown' => true]]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('createPixPayment')->once()->andThrow(new RuntimeException('timeout'));
        $service = app(PartnerPaymentStartService::class);
        try {
            $service->start($order->id);
            $this->fail('The gateway failure must not appear successful.');
        } catch (RuntimeException) {
            $this->assertSame('attention_required', $order->fresh()->status);
        }
        $this->expectException(RuntimeException::class);
        $service->start($order->id);
    }

    public function test_unverified_guests_or_extra_charges_never_reach_cielo(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $base = ['supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'quoted', 'payment_method' => 'pix', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']];
        $orders = [
            PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('G', 40), 'merchant_order_id' => 'ORDER2', 'reservation_idempotency_key' => 'partner-order-123457']),
            PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('H', 40), 'merchant_order_id' => 'ORDER3', 'reservation_idempotency_key' => 'partner-order-123458']),
        ];
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->twice()->andReturn(
            [['totalCents' => 52300, '_crcnGuestCountVerified' => false, 'additionalChargesKnown' => true]],
            [['totalCents' => 52300, '_crcnGuestCountVerified' => true, 'additionalChargesKnown' => false]],
        );
        $this->mock(CieloEcommerceClient::class)->shouldNotReceive('createPixPayment');
        foreach ($orders as $order) {
            try {
                app(PartnerPaymentStartService::class)->start($order->id);
                $this->fail('A cotação precisa ser verificada antes do pagamento.');
            } catch (RuntimeException) {
                $this->assertSame('quote_unavailable', $order->fresh()->status);
            }
        }
    }
}
