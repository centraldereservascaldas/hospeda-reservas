<?php

namespace Tests\Feature;

use App\Services\ImobSysSearchClient;
use App\Services\PartnerCheckoutCompletionService;
use App\Services\PartnerCheckoutOrderFactory;
use App\Services\PartnerPaymentStartService;
use App\Services\Payments\CieloCardPricing;
use App\Services\Payments\CieloEcommerceClient;
use App\Models\PartnerCheckoutOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class PartnerCheckoutBackendJourneyTest extends TestCase
{
    use RefreshDatabase;

    public function test_pix_quote_payment_and_partner_reservation_are_connected(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.key' => 'server-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'currency' => 'BRL']], 201)]);
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->twice()->andReturn([['totalCents' => 52300, '_crcnGuestCountVerified' => true, 'additionalChargesKnown' => true]]);
        $paymentId = '11111111-1111-4111-8111-111111111111';
        $order = app(PartnerCheckoutOrderFactory::class)->create(['propertyId' => 'imobsys-crcn-2-663', 'from' => now()->addDays(90)->toDateString(), 'to' => now()->addDays(92)->toDateString(), 'guests' => 2, 'method' => 'pix', 'acceptedBaseCents' => 52300, 'customer' => ['fullName' => 'Pessoa Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $cielo = $this->mock(CieloEcommerceClient::class);
        $cielo->shouldReceive('createPixPayment')->once()->andReturn(['Payment' => ['PaymentId' => $paymentId, 'QrCodeString' => 'PIX-TESTE']]);
        $cielo->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => $order->merchant_order_id, 'Payment' => ['PaymentId' => $paymentId, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        app(PartnerPaymentStartService::class)->start($order->id);
        $this->assertSame('awaiting_seller_payment', app(PartnerCheckoutCompletionService::class)->complete($order->id));
        $this->assertSame('1600', $order->fresh()->reservation_reference);
        Http::assertSentCount(1);
    }

    public function test_card_payment_preserves_installments_and_supplier_base(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.key' => 'server-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1601', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'currency' => 'BRL']], 201)]);
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->twice()->andReturn([['totalCents' => 52300, '_crcnGuestCountVerified' => true, 'additionalChargesKnown' => true]]);
        $paymentId = '11111111-1111-4111-8111-111111111111';
        $order = app(PartnerCheckoutOrderFactory::class)->create(['propertyId' => 'imobsys-crcn-2-663', 'from' => now()->addDays(90)->toDateString(), 'to' => now()->addDays(92)->toDateString(), 'guests' => 2, 'method' => 'card', 'installments' => 6, 'acceptedBaseCents' => 52300, 'customer' => ['fullName' => 'Pessoa Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $total = app(CieloCardPricing::class)->calculate('523.00', 6)['totalCents'];
        $this->assertSame($total, (int) $order->payment_cents);
        $cielo = $this->mock(CieloEcommerceClient::class);
        $cielo->shouldReceive('createCardPayment')->once()->andReturn(['Payment' => ['PaymentId' => $paymentId, 'QrCodeString' => 'PIX-TESTE']]);
        $cielo->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => $order->merchant_order_id, 'Payment' => ['PaymentId' => $paymentId, 'Status' => 2, 'Amount' => $total, 'Currency' => 'BRL', 'Type' => 'CreditCard', 'Installments' => 6]]);
        app(PartnerPaymentStartService::class)->start($order->id, '22222222-2222-4222-8222-222222222222');
        $this->assertSame('awaiting_seller_payment', app(PartnerCheckoutCompletionService::class)->complete($order->id));
        $this->assertSame('1601', $order->fresh()->reservation_reference);
        Http::assertSent(fn ($request): bool => $request['acceptedTotalCents'] === 52300);
    }

    public function test_paid_order_with_unknown_supplier_response_requires_review_without_another_charge_or_reservation(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.key' => 'server-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake(['api.example.test/*' => Http::response(['success' => false], 503)]);
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->twice()->andReturn([['totalCents' => 52300, '_crcnGuestCountVerified' => true, 'additionalChargesKnown' => true]]);
        $paymentId = '11111111-1111-4111-8111-111111111111';
        $order = app(PartnerCheckoutOrderFactory::class)->create(['propertyId' => 'imobsys-crcn-2-663', 'from' => now()->addDays(90)->toDateString(), 'to' => now()->addDays(92)->toDateString(), 'guests' => 2, 'method' => 'pix', 'acceptedBaseCents' => 52300, 'customer' => ['fullName' => 'Pessoa Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $cielo = $this->mock(CieloEcommerceClient::class);
        $cielo->shouldReceive('createPixPayment')->once()->andReturn(['Payment' => ['PaymentId' => $paymentId, 'QrCodeString' => 'PIX-TESTE']]);
        $cielo->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => $order->merchant_order_id, 'Payment' => ['PaymentId' => $paymentId, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        app(PartnerPaymentStartService::class)->start($order->id);
        try {
            app(PartnerCheckoutCompletionService::class)->complete($order->id);
            $this->fail('A resposta incerta deve exigir revisão.');
        } catch (RuntimeException) {
            $this->assertSame('attention_required', $order->fresh()->status);
        }
        $this->assertSame('attention_required', app(PartnerCheckoutCompletionService::class)->complete($order->id));
        $this->assertNull($order->fresh()->reservation_reference);
        $this->assertSame(1, PartnerCheckoutOrder::count());
        Http::assertSentCount(1);
    }
}
