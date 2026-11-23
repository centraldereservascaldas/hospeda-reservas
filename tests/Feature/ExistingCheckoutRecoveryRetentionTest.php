<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\ExistingCheckoutRecoveryCredential;
use App\Services\ExperimentalExistingCycleSettlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExistingCheckoutRecoveryRetentionTest extends TestCase
{
    use RefreshDatabase;

    public function test_pruned_signed_credential_allows_restart_but_old_unsigned_time_credentials_fail_closed(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $service = app(ExistingCheckoutRecoveryCredential::class);
        $this->travelTo(now()->subDays(8));
        $expired = $service->issue('ZY92K');
        $this->travelBack();
        $this->artisan('direct-booking:prune-existing-checkout-recovery-credentials')->assertSuccessful();
        $this->assertDatabaseMissing('existing_checkout_recovery_credentials', ['credential_hash' => $service->hash($expired)]);
        $this->withHeader('X-Checkout-Recovery-Secret', $expired)->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertOk()->assertJsonPath('restart', true);
        $this->withHeader('X-Checkout-Recovery-Secret', $expired)->postJson('/api/existing-reservations/AB12C/recover')->assertUnprocessable();
        $nonce = str_repeat('a', 64);
        $legacy = $nonce.hash_hmac('sha256', 'existing-checkout-recovery:ZY92K:'.$nonce, (string) config('app.key'));
        $this->withHeader('X-Checkout-Recovery-Secret', $legacy)->postJson('/api/existing-reservations/ZY92K/recover')->assertNotFound();
        $this->assertFalse($service->hasExpiredSignedIssueTime($legacy));

        $oldTimestamp = str_pad(dechex(now()->subDays(8)->timestamp), 16, '0', STR_PAD_LEFT);
        $forged = $oldTimestamp.str_repeat('a', 64).str_repeat('0', 64);
        $this->assertTrue($service->hasExpiredSignedIssueTime($forged));
        $this->assertFalse($service->valid('AB12C', $forged));
        $this->withHeader('X-Checkout-Recovery-Secret', $forged)
            ->postJson('/api/existing-reservations/AB12C/recover')->assertUnprocessable();
    }

    public function test_issued_recovery_credential_is_revoked_once_and_cannot_be_replayed(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $service = app(ExistingCheckoutRecoveryCredential::class);
        $secret = $service->issue('ZY92K');
        $hash = $service->hash($secret);

        $this->withHeader('X-Checkout-Recovery-Secret', $secret)
            ->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertOk()->assertJsonPath('restart', true);
        $this->assertDatabaseHas('existing_checkout_recovery_credentials', ['credential_hash' => $hash, 'state' => 'revoked']);

        $this->withHeader('X-Checkout-Recovery-Secret', $secret)
            ->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertNotFound()->assertJsonPath('success', false);
    }

    #[DataProvider('inactiveCredentialStates')]
    public function test_inactive_recovery_credential_cannot_restart(string $state): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $service = app(ExistingCheckoutRecoveryCredential::class);
        $secret = $service->issue('ZY92K');
        $hash = $service->hash($secret);
        DB::table('existing_checkout_recovery_credentials')->where('credential_hash', $hash)->update(['state' => $state]);

        $this->withHeader('X-Checkout-Recovery-Secret', $secret)
            ->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertNotFound()->assertJsonPath('success', false);
    }

    public static function inactiveCredentialStates(): array
    {
        return ['revoked' => ['revoked'], 'consumed' => ['consumed']];
    }

    public function test_expired_resume_token_can_restart_only_after_verified_deposit_settlement(): void
    {
        $service = app(ExistingCheckoutRecoveryCredential::class);
        $secret = $service->issue('ZY92K');
        $hash = $service->hash($secret);
        $order = $this->settledDepositOrder($service->hash($secret));
        $this->mock(ExperimentalExistingCycleSettlement::class)
            ->shouldReceive('recordedProofValid')->once()->andReturnTrue();

        $this->withHeader('X-Checkout-Recovery-Secret', $secret)
            ->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertOk()->assertExactJson(['success' => true, 'restart' => true]);

        $this->assertSame(DirectBookingOrderStatus::EntradaConciliada, $order->fresh()->status);
        $this->assertDatabaseHas('existing_checkout_recovery_credentials', ['credential_hash' => $hash, 'state' => 'revoked']);
        $this->withHeader('X-Checkout-Recovery-Secret', $secret)
            ->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertNotFound()->assertJsonPath('success', false);
    }

    #[DataProvider('unsafeSettledDepositRecoveryScenarios')]
    public function test_expired_resume_token_fails_closed_for_unsettled_or_reviewed_deposits(string $scenario): void
    {
        $service = app(ExistingCheckoutRecoveryCredential::class);
        $secret = $service->issue('ZY92K');
        $order = $this->settledDepositOrder($service->hash($secret));
        $cycle = DB::table('existing_reservation_payment_cycles')->first();

        if ($scenario === 'pending_attempt') {
            $order->paymentAttempts()->create([
                'idempotency_key' => 'pending-recovery-attempt-001', 'request_fingerprint' => str_repeat('c', 64),
                'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'pending', 'amount' => '50.00', 'currency' => 'BRL',
            ]);
        } elseif ($scenario === 'review_required') {
            $order->update(['operational_events' => [
                ['event' => 'existing_deposit_verification_started', 'id' => 'review-check'],
                ['event' => 'existing_deposit_verification', 'id' => 'review-check', 'verified' => false],
            ]]);
        } elseif ($scenario === 'settlement_proof_invalid') {
            DB::table('existing_reservation_payment_cycles')->where('id', $cycle->id)->update(['settlement_proof_hash' => str_repeat('0', 64)]);
            $this->mock(ExperimentalExistingCycleSettlement::class)
                ->shouldReceive('recordedProofValid')->once()->andReturnFalse();
        } elseif ($scenario === 'snapshot_card_method') {
            $snapshot = $order->quote_snapshot;
            $snapshot['existing_reservation']['selected_payment_method'] = 'card';
            $order->update(['quote_snapshot' => $snapshot]);
        } elseif ($scenario === 'approved_card_attempt') {
            $order->paymentAttempts()->first()->update(['payment_method' => 'card', 'payment_method_id' => 'cielo_credit_card']);
        } elseif ($scenario === 'card_attempt_identifier') {
            $order->paymentAttempts()->first()->update(['payment_method_id' => 'cielo_credit_card']);
        } elseif ($scenario === 'unknown_attempt_identifier') {
            $order->paymentAttempts()->first()->update(['payment_method_id' => 'unknown']);
        }

        $code = $scenario === 'cross_code' ? 'AB12C' : 'ZY92K';
        $response = $this->withHeader('X-Checkout-Recovery-Secret', $secret)
            ->postJson('/api/existing-reservations/'.$code.'/recover');
        if ($scenario === 'cross_code') {
            $response->assertUnprocessable();
        } else {
            $response->assertNotFound()->assertJsonPath('success', false);
        }

        $this->assertSame('application/json', $response->headers->get('Content-Type'));
        if ($scenario !== 'settlement_proof_invalid') {
            $this->assertDatabaseHas('existing_reservation_payment_cycles', ['id' => $cycle->id, 'state' => 'settled']);
        }
    }

    public static function unsafeSettledDepositRecoveryScenarios(): array
    {
        return [
            'pending attempt' => ['pending_attempt'],
            'operational review required' => ['review_required'],
            'invalid settlement evidence' => ['settlement_proof_invalid'],
            'recovery secret for different reservation code' => ['cross_code'],
            'snapshot selected card' => ['snapshot_card_method'],
            'approved card attempt' => ['approved_card_attempt'],
            'card payment identifier' => ['card_attempt_identifier'],
            'unknown payment identifier' => ['unknown_attempt_identifier'],
        ];
    }

    private function settledDepositOrder(string $recoveryHash): DirectBookingOrder
    {
        $reservationId = str_repeat('a', 24);
        $snapshot = [
            '_id' => $reservationId,
            'reservation_code' => 'ZY92K',
            'payment_plan' => 'deposit',
            'selected_payment_method' => 'pix',
            'reservation_total_cents' => 10000,
            'pending_amount_cents' => 5000,
            'reported_paid_present' => true,
            'reported_paid_cents' => 0,
            'payment_id' => str_repeat('b', 24),
            'pending_provider_id' => str_repeat('f', 24),
        ];
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::EntradaConciliada,
            'idempotency_key' => 'settled-recovery-order-key',
            'request_fingerprint' => str_repeat('a', 64),
            'public_reference' => str_repeat('R', 40),
            'existing_checkout_recovery_hash' => $recoveryHash,
            'resume_token' => str_repeat('T', 64),
            'resume_token_expires_at' => now()->subMinute(),
            'listing_id' => 'listing',
            'stays_listing_id' => 'listing',
            'stays_reservation_id' => $reservationId,
            'reservation_status' => 'booked',
            'check_in' => '2030-01-01',
            'check_out' => '2030-01-02',
            'guests' => ['adults' => 1],
            'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test',
            'guest_phone' => '64999999999',
            'quote_total' => '50.00',
            'currency' => 'BRL',
            'quote_snapshot' => ['existing_reservation' => $snapshot],
            'accepted_terms_version' => 'test',
            'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(),
            'origin' => 'stays_existing',
            'payment_status' => 'approved',
            'gateway_provider' => 'cielo',
            'gateway_merchant_id' => 'test-merchant',
            'operational_events' => [['event' => 'existing_deposit_verification', 'id' => 'verified-check', 'verified' => true]],
        ]);
        $attempt = $order->paymentAttempts()->create([
            'idempotency_key' => 'settled-recovery-attempt-001', 'request_fingerprint' => str_repeat('b', 64),
            'gateway_payment_id' => 'gateway-payment-id', 'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'test-merchant',
            'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'approved', 'amount' => '50.00',
            'currency' => 'BRL', 'paid_at' => now()->subMinutes(2),
        ]);
        DB::table('existing_reservation_payment_cycles')->insert([
            'id' => (string) Str::uuid(),
            'stays_reservation_id' => $reservationId,
            'active_reservation_id' => null,
            'direct_booking_order_id' => $order->id,
            'direct_booking_payment_attempt_id' => $attempt->id,
            'idempotency_key' => 'settled-recovery-cycle-001',
            'state' => 'settled',
            'settlement_proof' => json_encode(['fixture' => true], JSON_THROW_ON_ERROR),
            'settlement_proof_hash' => str_repeat('c', 64),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $order;
    }

    public function test_pruning_removes_old_unused_credentials_and_preserves_live_orders(): void
    {
        $service = app(ExistingCheckoutRecoveryCredential::class);
        $unused = $service->issue('ZY92K');
        $inUse = $service->issue('ZY92K');
        $fresh = $service->issue('ZY92K');
        $unusedHash = $service->hash($unused);
        $inUseHash = $service->hash($inUse);
        DB::table('existing_checkout_recovery_credentials')->whereIn('credential_hash', [$unusedHash, $inUseHash])
            ->update(['created_at' => now()->subDays(8)]);
        DirectBookingOrder::query()->create([
            'idempotency_key' => 'retention-test-order-key', 'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'check_in' => '2030-01-01', 'check_out' => '2030-01-02',
            'guests' => ['adults' => 1], 'guest_name' => 'Test', 'guest_email' => 'test@example.test', 'guest_phone' => '64999999999',
            'quote_total' => '100.00', 'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test',
            'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(), 'operational_events' => [], 'origin' => 'stays_existing',
            'existing_checkout_recovery_hash' => $inUseHash, 'public_reference' => str_repeat('R', 40),
            'resume_token' => str_repeat('T', 64), 'resume_token_expires_at' => now()->addDays(2),
        ]);

        $this->artisan('direct-booking:prune-existing-checkout-recovery-credentials')->assertSuccessful();
        $this->assertDatabaseMissing('existing_checkout_recovery_credentials', ['credential_hash' => $unusedHash]);
        $this->assertDatabaseHas('existing_checkout_recovery_credentials', ['credential_hash' => $inUseHash]);
        $this->assertDatabaseHas('existing_checkout_recovery_credentials', ['credential_hash' => $service->hash($fresh)]);
        $this->assertTrue($service->expired(now()->subDays(7)->toDateTimeString()));
        $this->assertFalse($service->expired(now()->subDays(6)->toDateTimeString()));
    }
}
