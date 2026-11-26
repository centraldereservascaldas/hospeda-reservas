<?php

namespace Tests\Feature;

use App\Models\PartnerCheckoutOrder;
use App\Services\PartnerPaidReservationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class PartnerPaidReservationServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true, 'services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.reservation_key' => 'reservation-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
    }

    private function order(string $status): PartnerCheckoutOrder
    {
        return PartnerCheckoutOrder::create(['public_reference' => str_repeat('A', 40), 'supplier_property_id' => 'imobsys-crcn-2-663', 'check_in' => '2027-05-17', 'check_out' => '2027-05-19', 'guests' => 2, 'base_cents' => 52300, 'payment_cents' => 52300, 'currency' => 'BRL', 'status' => $status, 'payment_id' => 'PAY1', 'merchant_order_id' => 'ORDER1', 'payment_method' => 'pix', 'reservation_idempotency_key' => 'partner-order-123456', 'encrypted_customer' => ['fullName' => 'Teste', 'cpf' => '12345678901', 'phone' => '64999999999']]);
    }

    public function test_paid_order_creates_one_reservation_and_replay_is_safe(): void
    {
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'supplierPayableObservedCents' => 41800, 'currency' => 'BRL']], 201)]);
        $order = $this->order('payment_verified');
        app(PartnerPaidReservationService::class)->create($order->id);
        app(PartnerPaidReservationService::class)->create($order->id);
        $this->assertSame('awaiting_seller_payment', $order->fresh()->status);
        $this->assertSame('1600', $order->fresh()->reservation_reference);
        $this->assertSame(41800, (int) $order->fresh()->supplier_payable_observed_cents);
        Http::assertSentCount(1);
    }

    public function test_unpaid_order_cannot_request_reservation(): void
    {
        Http::fake();
        $order = $this->order('payment_pending');
        try {
            app(PartnerPaidReservationService::class)->create($order->id);
            $this->fail('Unpaid orders cannot reserve.');
        } catch (RuntimeException) {
            Http::assertNothingSent();
        }
    }

    public function test_late_supplier_response_is_retained_for_manual_review_without_retry(): void
    {
        $order = $this->order('payment_verified');
        Http::fake(function () use ($order) {
            PartnerCheckoutOrder::query()->whereKey($order->id)->update(['status' => 'attention_required', 'attention_reason' => 'supplier_outcome_unknown']);
            return Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'supplierPayableObservedCents' => 41800, 'currency' => 'BRL']], 201);
        });

        app(PartnerPaidReservationService::class)->create($order->id);
        $this->assertSame('attention_required', $order->fresh()->status);
        $this->assertSame('supplier_outcome_unknown', $order->fresh()->attention_reason);
        $this->assertSame('1600', $order->fresh()->reservation_reference);
        $this->assertSame(41800, (int) $order->fresh()->supplier_payable_observed_cents);
        Http::assertSentCount(1);
    }

    public function test_unknown_supplier_result_requires_manual_review(): void
    {
        Http::fake(['api.example.test/*' => Http::response(['success' => false], 503, ['X-Request-Id' => '123e4567-e89b-42d3-a456-426614174000'])]);
        $order = $this->order('payment_verified');
        try {
            app(PartnerPaidReservationService::class)->create($order->id);
            $this->fail('An unknown result requires review.');
        } catch (RuntimeException) {
            $this->assertSame('attention_required', $order->fresh()->status);
            $this->assertSame('123e4567-e89b-42d3-a456-426614174000', $order->fresh()->supplier_operation_id);
            Http::assertSentCount(1);
        }
    }

    public function test_production_or_disabled_checkout_never_calls_supplier(): void
    {
        Http::fake();
        $order = $this->order('payment_verified');
        foreach (['production', 'disabled'] as $mode) {
            $originalEnvironment = $this->app['env'];
            if ($mode === 'production') $this->app['env'] = 'production';
            if ($mode === 'disabled') config(['services.partner_checkout_sandbox.enabled' => false]);
            try {
                app(PartnerPaidReservationService::class)->create($order->id);
                $this->fail('Supplier reservation must remain disabled.');
            } catch (RuntimeException) {
                $this->assertSame('payment_verified', $order->fresh()->status);
                Http::assertNothingSent();
            } finally {
                $this->app['env'] = $originalEnvironment;
            }
        }
    }
}
