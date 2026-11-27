<?php

namespace Tests\Feature;

use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerPaymentReconciliationService;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnerPaymentReconciliationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_matching_captured_payment_is_accepted(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('B', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => $id, 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(
            ['MerchantOrderId' => 'ORDER1', 'Payment' => ['PaymentId' => $id, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']],
        );
        $service = app(PartnerPaymentReconciliationService::class);
        $this->assertTrue($service->reconcile($order->id));
        $this->assertSame('payment_verified', $order->fresh()->status);
        $this->assertFalse($service->reconcile($order->id));
    }

    public function test_mismatched_captured_amount_is_sent_to_operations_without_reservation(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('B', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => $id, 'payment_qr_code' => 'test-qr', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => 'ORDER1', 'Payment' => ['PaymentId' => $id, 'Status' => 2, 'Amount' => 52301, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        $service = app(PartnerPaymentReconciliationService::class);
        $this->assertFalse($service->reconcile($order->id));
        $this->assertSame('attention_required', $order->fresh()->status);
        $this->assertSame('payment_mismatch', $order->fresh()->attention_reason);
        $this->assertNull($order->fresh()->payment_qr_code);
        $this->assertNull($order->fresh()->reservation_reference);
        $this->assertFalse($service->reconcile($order->id));
    }

    public function test_late_payment_id_is_verified_against_cielo_before_advancing(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('K', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'payment_outcome_unknown', 'payment_id' => $id, 'merchant_order_id' => 'ORDERL', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-late', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => 'ORDERL', 'Payment' => ['PaymentId' => $id, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        $this->assertTrue(app(PartnerPaymentReconciliationService::class)->reconcile($order->id));
        $this->assertSame('payment_verified', $order->fresh()->status);
        $this->assertNull($order->fresh()->attention_reason);
    }

    public function test_declined_payment_is_not_marked_as_paid(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('B', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => $id, 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => 'ORDER1', 'Payment' => ['PaymentId' => $id, 'Status' => 3, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        $this->assertFalse(app(PartnerPaymentReconciliationService::class)->reconcile($order->id));
        $this->assertSame('payment_rejected', $order->fresh()->status);
    }

    public function test_refunded_pix_is_not_marked_as_paid(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('T', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => $id, 'payment_qr_code' => 'test-qr', 'merchant_order_id' => 'REFUND', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-refund', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => 'REFUND', 'Payment' => ['PaymentId' => $id, 'Status' => 11, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        $this->assertFalse(app(PartnerPaymentReconciliationService::class)->reconcile($order->id));
        $this->assertSame('payment_cancelled', $order->fresh()->status);
        $this->assertNull($order->fresh()->payment_qr_code);
        $this->assertNull($order->fresh()->reservation_reference);
    }

    public function test_confirmed_payment_with_refund_requires_review_without_creating_reservation(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('V', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => $id, 'payment_qr_code' => 'test-qr', 'merchant_order_id' => 'PARTIAL', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-partial', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => 'PARTIAL', 'Payment' => ['PaymentId' => $id, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix', 'Refunds' => [['Amount' => 10000, 'Status' => 3]]]]);
        $this->assertFalse(app(PartnerPaymentReconciliationService::class)->reconcile($order->id));
        $this->assertSame('attention_required', $order->fresh()->status);
        $this->assertSame('payment_refund_review', $order->fresh()->attention_reason);
        $this->assertNull($order->fresh()->payment_qr_code);
        $this->assertNull($order->fresh()->reservation_reference);
    }

    public function test_voided_amount_or_malformed_refunds_require_review(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $base = ['supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_method' => 'pix', 'encrypted_customer' => ['fullName' => 'Teste']];
        $first = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('X', 40), 'merchant_order_id' => 'VOIDED', 'payment_id' => '11111111-1111-4111-8111-111111111111', 'reservation_idempotency_key' => 'partner-order-voided']);
        $second = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('Y', 40), 'merchant_order_id' => 'MALFORMED', 'payment_id' => '22222222-2222-4222-8222-222222222222', 'reservation_idempotency_key' => 'partner-order-malformed']);
        $payment = ['Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix'];
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->twice()->andReturn(
            ['MerchantOrderId' => 'VOIDED', 'Payment' => [...$payment, 'PaymentId' => $first->payment_id, 'VoidedAmount' => 1]],
            ['MerchantOrderId' => 'MALFORMED', 'Payment' => [...$payment, 'PaymentId' => $second->payment_id, 'Refunds' => 'invalid']],
        );
        $service = app(PartnerPaymentReconciliationService::class);
        foreach ([$first, $second] as $order) {
            $this->assertFalse($service->reconcile($order->id));
            $this->assertSame('payment_refund_review', $order->fresh()->attention_reason);
            $this->assertNull($order->fresh()->reservation_reference);
        }
    }

    public function test_late_gateway_result_cannot_overwrite_another_attention_decision(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox']);
        $id = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('W', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'attention_reason' => 'payment_outcome_unknown', 'payment_id' => $id, 'merchant_order_id' => 'ORDERRACE', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-race', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturnUsing(function () use ($order, $id) {
            $order->update(['attention_reason' => 'payment_mismatch']);

            return ['MerchantOrderId' => 'ORDERRACE', 'Payment' => ['PaymentId' => $id, 'Status' => 3, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']];
        });
        $this->assertFalse(app(PartnerPaymentReconciliationService::class)->reconcile($order->id));
        $this->assertSame('attention_required', $order->fresh()->status);
        $this->assertSame('payment_mismatch', $order->fresh()->attention_reason);
    }
}
