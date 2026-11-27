<?php

namespace Tests\Feature;

use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerUncertainPaymentRecovery;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnerUncertainPaymentRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_recovery_requires_exact_payment_and_never_submits_a_charge(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('G', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $order->update(['attention_reason' => 'payment_outcome_unknown']);
        $id = '11111111-1111-4111-8111-111111111111';
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentByMerchantOrderId')->twice()->andReturn(
            ['MerchantOrderId' => 'ORDER1', 'Payment' => ['PaymentId' => $id, 'Amount' => 52301, 'Currency' => 'BRL', 'Type' => 'Pix']],
            ['MerchantOrderId' => 'ORDER1', 'Payment' => ['PaymentId' => $id, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix', 'Status' => 12, 'QrCodeString' => 'PIX-TESTE']],
        );
        $service = app(PartnerUncertainPaymentRecovery::class);
        $this->assertFalse($service->recover($order->id));
        $this->assertSame('attention_required', $order->fresh()->status);
        $this->assertTrue($service->recover($order->id));
        $this->assertSame('payment_pending', $order->fresh()->status);
        $this->assertSame($id, $order->fresh()->payment_id);
        $this->assertSame('PIX-TESTE', $order->fresh()->payment_qr_code);
        $this->assertFalse($service->recover($order->id));
    }

    public function test_recovery_does_not_show_pix_when_paid_or_expired(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $base = ['supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'payment_outcome_unknown', 'payment_method' => 'pix', 'encrypted_customer' => ['fullName' => 'Teste']];
        $paid = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('R', 40), 'merchant_order_id' => 'PAID', 'reservation_idempotency_key' => 'partner-order-paid']);
        $expired = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('S', 40), 'merchant_order_id' => 'EXPIRED', 'reservation_idempotency_key' => 'partner-order-expired']);
        $expired->created_at = now()->subMinutes(31);
        $expired->save();
        $payment = ['PaymentId' => $id, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix', 'QrCodeString' => 'PIX-TESTE'];
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentByMerchantOrderId')->twice()->andReturn(
            ['MerchantOrderId' => 'PAID', 'Payment' => [...$payment, 'Status' => 2]],
            ['MerchantOrderId' => 'EXPIRED', 'Payment' => [...$payment, 'PaymentId' => '22222222-2222-4222-8222-222222222222', 'Status' => 12]],
        );
        $service = app(PartnerUncertainPaymentRecovery::class);
        $this->assertTrue($service->recover($paid->id));
        $this->assertNull($paid->fresh()->payment_qr_code);
        $this->assertTrue($service->recover($expired->id));
        $this->assertNull($expired->fresh()->payment_qr_code);
    }

    public function test_supplier_attention_is_never_treated_as_an_uncertain_payment(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('P', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown', 'merchant_order_id' => 'ORDER2', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123457', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldNotReceive('findPaymentByMerchantOrderId');
        $this->assertFalse(app(PartnerUncertainPaymentRecovery::class)->recover($order->id));
        $this->assertSame('supplier_outcome_unknown', $order->fresh()->attention_reason);
    }
}
