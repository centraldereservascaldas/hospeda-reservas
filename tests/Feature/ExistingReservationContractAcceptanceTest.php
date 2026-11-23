<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Resources\DirectBookingOrderResource;
use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationPaymentPlanPolicy;
use App\Services\LegalPageRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ExistingReservationContractAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_partial_or_inconsistent_contract_evidence_requires_review_and_is_not_overwritten(): void
    {
        $order = $this->order();
        $contract = ['version' => '2026-01'];
        $hash = hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $payload = ['accepted' => true, 'version' => '2026-01', 'contentHash' => $hash];
        $this->mock(LegalPageRegistry::class)->shouldReceive('find')->zeroOrMoreTimes()->andReturn($contract);
        foreach ([['contract' => $contract], ['contract' => null], ['contract_content_hash' => $hash], ['contract' => $contract, 'contract_content_hash' => str_repeat('0', 64)]] as $terms) {
            $order->forceFill(['accepted_terms_snapshot' => $terms])->save();
            $resource = (new DirectBookingOrderResource($order->fresh()))->resolve(Request::create('/'));
            $this->assertFalse($resource['existingContractRequired']);
            $this->assertTrue($resource['existingContractReviewRequired']);
            $this->assertFalse(app(ExistingReservationPaymentPlanPolicy::class)->canStartOrderPayment($order->fresh(), 'pix'));
            $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson('/api/checkout/'.$order->public_reference.'/existing-contract', $payload)->assertConflict();
            $this->assertSame($terms, $order->fresh()->accepted_terms_snapshot);
        }
        $order->forceFill(['accepted_terms_snapshot' => []])->save();
        $resource = (new DirectBookingOrderResource($order->fresh()))->resolve(Request::create('/'));
        $this->assertTrue($resource['existingContractRequired']);
        $this->assertFalse($resource['existingContractReviewRequired']);
        $order->forceFill(['accepted_terms_snapshot' => ['contract' => $contract, 'contract_content_hash' => $hash]])->save();
        $resource = (new DirectBookingOrderResource($order->fresh()))->resolve(Request::create('/'));
        $this->assertFalse($resource['existingContractRequired']);
        $this->assertFalse($resource['existingContractReviewRequired']);
    }

    public function test_legacy_order_requires_its_resume_token_and_exact_current_contract_before_acceptance(): void
    {
        $contract = ['slug' => 'contrato', 'version' => '2026-01', 'title' => 'Contrato', 'sections' => [['title' => 'Condições', 'content' => 'Condições atuais']]];
        $this->mock(LegalPageRegistry::class)->shouldReceive('find')->with('contrato')->andReturn($contract);
        $hash = hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $order = $this->order();
        $url = '/api/checkout/'.$order->public_reference.'/existing-contract';
        $payload = ['accepted' => true, 'version' => '2026-01', 'contentHash' => $hash];
        $this->postJson($url, $payload)->assertNotFound();
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson($url, array_replace($payload, ['contentHash' => str_repeat('0', 64)]))->assertConflict();
        $this->assertArrayNotHasKey('contract', $order->fresh()->accepted_terms_snapshot);
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson($url, $payload)->assertOk()->assertJsonPath('code', 'existing_contract_accepted');
        $this->assertSame($contract, $order->fresh()->accepted_terms_snapshot['contract']);
        $this->assertSame($hash, $order->fresh()->accepted_terms_snapshot['contract_content_hash']);
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson($url, $payload)->assertOk();
        $order->forceFill(['status' => DirectBookingOrderStatus::PagamentoPendente, 'payment_status' => 'pending'])->save();
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson($url, $payload)->assertOk();
        $this->assertSame(str_repeat('a', 64), $order->fresh()->request_fingerprint);
    }

    public function test_acceptance_is_denied_after_payment_started_or_for_new_reservations(): void
    {
        $contract = ['version' => '2026-01'];
        $this->mock(LegalPageRegistry::class)->shouldReceive('find')->with('contrato')->andReturn($contract);
        $payload = ['accepted' => true, 'version' => '2026-01', 'contentHash' => hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))];
        $order = $this->order();
        $order->forceFill(['payment_status' => 'pending'])->save();
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson('/api/checkout/'.$order->public_reference.'/existing-contract', $payload)->assertConflict();
        $order->forceFill(['origin' => 'website', 'payment_status' => null])->save();
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson('/api/checkout/'.$order->public_reference.'/existing-contract', $payload)->assertNotFound();
    }

    public function test_acceptance_requires_terminal_attempt_and_closed_cycle(): void
    {
        $contract = ['version' => '2026-01'];
        $this->mock(LegalPageRegistry::class)->shouldReceive('find')->with('contrato')->andReturn($contract);
        $payload = ['accepted' => true, 'version' => '2026-01', 'contentHash' => hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))];
        $order = $this->order();
        $order->forceFill(['status' => DirectBookingOrderStatus::PagamentoRecusado, 'payment_status' => 'rejected', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant'])->save();
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'terminal-attempt-123456', 'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant', 'gateway_payment_id' => 'decline', 'gateway_status' => 'rejected',
            'payment_method' => 'card', 'payment_method_id' => 'cielo_credit_card', 'status' => 'rejected', 'amount' => '10.00', 'base_amount' => '10.00', 'currency' => 'BRL',
        ]);
        $cycle = (string) Str::uuid();
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => $cycle, 'stays_reservation_id' => str_repeat('c', 24), 'active_reservation_id' => str_repeat('c', 24),
            'direct_booking_order_id' => $order->id, 'direct_booking_payment_attempt_id' => $attempt->id,
            'idempotency_key' => 'terminal-cycle-123456', 'state' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $url = '/api/checkout/'.$order->public_reference.'/existing-contract';
        $this->assertFalse((new DirectBookingOrderResource($order->fresh()))->resolve(Request::create('/'))['existingContractAcceptable']);
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson($url, $payload)->assertConflict();
        DB::table('existing_reservation_payment_cycles')->where('id', $cycle)->update(['state' => 'declined', 'active_reservation_id' => null]);
        $this->assertTrue((new DirectBookingOrderResource($order->fresh()))->resolve(Request::create('/'))['existingContractAcceptable']);
        $this->withHeader('X-Checkout-Resume-Token', $order->resume_token)->postJson($url, $payload)->assertOk();
        $this->assertSame($contract, $order->fresh()->accepted_terms_snapshot['contract']);
    }

    private function order(): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'contract-legacy-test-key', 'request_fingerprint' => str_repeat('a', 64),
            'public_reference' => str_repeat('r', 40), 'resume_token' => str_repeat('t', 64), 'resume_token_expires_at' => now()->addDay(),
            'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'stays_reservation_id' => str_repeat('c', 24),
            'check_in' => '2030-11-13', 'check_out' => '2030-11-16', 'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0],
            'guest_name' => 'Teste', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '10.00', 'currency' => 'BRL',
            'quote_snapshot' => [], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(),
            'origin' => 'stays_existing', 'expires_at' => now()->addHour(), 'operational_events' => [],
        ]);
    }
}
