<?php

namespace Tests\Feature;

use App\Jobs\CompletePartnerCheckout;
use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerCheckoutCompletionService;
use App\Services\Payments\CieloEcommerceClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PartnerCheckoutCompletionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_captured_payment_creates_exactly_one_partner_reservation(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.reservation_key' => 'reservation-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'currency' => 'BRL']], 201)]);
        $paymentId = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('C', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'payment_pending', 'payment_id' => $paymentId, 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $this->mock(CieloEcommerceClient::class)->shouldReceive('findPaymentById')->once()->andReturn(['MerchantOrderId' => 'ORDER1', 'Payment' => ['PaymentId' => $paymentId, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']]);
        $service = app(PartnerCheckoutCompletionService::class);
        $this->assertSame('awaiting_seller_payment', $service->complete($order->id));
        $this->assertSame('awaiting_seller_payment', $service->complete($order->id));
        $this->assertSame('1600', $order->fresh()->reservation_reference);
        Http::assertSentCount(1);
    }

    public function test_queue_job_contains_only_order_identifier_and_never_retries_mutation_automatically(): void
    {
        $job = new CompletePartnerCheckout('order-id');
        $this->assertSame('order-id', $job->orderId);
        $this->assertSame(1, $job->tries);
        $this->assertSame(180, $job->timeout);
        $this->assertSame('order-id', $job->uniqueId());
        $this->assertSame(240, $job->uniqueFor);
    }

    public function test_recovery_queues_pending_orders_but_not_uncertain_supplier_calls(): void
    {
        Queue::fake();
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $base = ['supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'payment_method' => 'pix', 'encrypted_customer' => ['fullName' => 'Teste']];
        $pending = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('D', 40), 'merchant_order_id' => 'ORDER2', 'reservation_idempotency_key' => 'partner-order-123457', 'status' => 'payment_pending']);
        PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('E', 40), 'merchant_order_id' => 'ORDER3', 'reservation_idempotency_key' => 'partner-order-123458', 'status' => 'reservation_starting']);
        $uncertainPayment = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('F', 40), 'merchant_order_id' => 'ORDER5', 'reservation_idempotency_key' => 'partner-order-123460', 'status' => 'attention_required']);
        PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('G', 40), 'merchant_order_id' => 'ORDER6', 'reservation_idempotency_key' => 'partner-order-123461', 'status' => 'attention_required', 'payment_id' => 'PAY6']);
        $this->artisan('partner-checkout:recover-sandbox')->assertSuccessful();
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $pending->id);
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $uncertainPayment->id);
        Queue::assertPushed(CompletePartnerCheckout::class, 2);
    }

    public function test_sandbox_recovery_requires_explicit_feature_flag(): void
    {
        Queue::fake();
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => false]);
        $this->artisan('partner-checkout:recover-sandbox')->assertFailed();
        Queue::assertNothingPushed();
    }

    public function test_recovery_rotates_between_pending_orders_when_batch_is_limited(): void
    {
        Queue::fake();
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $base = ['supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'payment_method' => 'pix', 'encrypted_customer' => ['fullName' => 'Teste'], 'status' => 'payment_pending'];
        $first = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('J', 40), 'merchant_order_id' => 'ORDER7', 'reservation_idempotency_key' => 'partner-order-123462']);
        $second = PartnerCheckoutOrder::create([...$base, 'public_reference' => str_repeat('K', 40), 'merchant_order_id' => 'ORDER8', 'reservation_idempotency_key' => 'partner-order-123463']);
        $this->artisan('partner-checkout:recover-sandbox', ['--limit' => 1])->assertSuccessful();
        $this->artisan('partner-checkout:recover-sandbox', ['--limit' => 1])->assertSuccessful();
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $first->id);
        Queue::assertPushed(CompletePartnerCheckout::class, fn (CompletePartnerCheckout $job): bool => $job->orderId === $second->id);
        Queue::assertPushed(CompletePartnerCheckout::class, 2);
    }

    public function test_uncertain_gateway_result_is_recovered_before_reserving(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.reservation_key' => 'reservation-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'currency' => 'BRL']], 201)]);
        $paymentId = '11111111-1111-4111-8111-111111111111';
        $order = PartnerCheckoutOrder::create(['public_reference' => str_repeat('H', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => 'attention_required', 'merchant_order_id' => 'ORDER4', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123459', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
        $response = ['MerchantOrderId' => 'ORDER4', 'Payment' => ['PaymentId' => $paymentId, 'Status' => 2, 'Amount' => 52300, 'Currency' => 'BRL', 'Type' => 'Pix']];
        $cielo = $this->mock(CieloEcommerceClient::class);
        $cielo->shouldReceive('findPaymentByMerchantOrderId')->once()->andReturn($response);
        $cielo->shouldReceive('findPaymentById')->once()->andReturn($response);
        $this->assertSame('awaiting_seller_payment', app(PartnerCheckoutCompletionService::class)->complete($order->id));
        $this->assertSame('1600', $order->fresh()->reservation_reference);
        Http::assertSentCount(1);
    }
}
