<?php

namespace Tests\Feature;

use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerManualPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class PartnerManualPaymentServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_payment_is_recorded_once_with_operator_and_reference(): void
    {
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('I', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'awaiting_seller_payment', 'payment_id' => 'PAY1', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_reference' => '1600', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste']]);
        $service = app(PartnerManualPaymentService::class);
        $service->record($order->id, 'Vendedor', 50000, 'REF1');
        $this->assertSame('supplier_payment_recorded', $order->fresh()->status);
        $this->assertSame(50000, (int) $order->fresh()->supplier_paid_cents);
        $this->assertSame('REF1', $order->fresh()->supplier_payment_reference);
        $this->expectException(RuntimeException::class);
        $service->record($order->id, 'Vendedor', 50000, 'REF1');
    }
}
