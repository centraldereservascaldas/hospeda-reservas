<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DirectBookingCancellationRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_returns_stable_receipt_and_replay_does_not_duplicate_event(): void
    {
        $this->freezeTime();
        $this->authenticateAs('guest-1', 'guest@example.test');
        $order = $this->confirmedOrder('guest@example.test');

        $firstResponse = $this->postJson('/api/my-direct-booking-orders/'.$order->public_reference.'/cancel', [], [
            'Authorization' => 'Bearer guest-token',
        ])->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('cancellationStatus', 'requested')
            ->assertJsonPath('alreadyRequested', false)
            ->assertJsonPath('cancellationReceipt.protocol', 'CANCEL-'.$order->public_reference)
            ->assertJsonPath('cancellationReceipt.requestedAt', now()->toISOString())
            ->assertJsonPath('message', 'A solicitação de cancelamento foi recebida para análise da Central; o cancelamento ainda não foi concluído.');

        $this->postJson('/api/my-direct-booking-orders/'.$order->public_reference.'/cancel', [], [
            'Authorization' => 'Bearer guest-token',
        ])->assertOk()
            ->assertJsonPath('alreadyRequested', true)
            ->assertJsonPath('cancellationReceipt', $firstResponse->json('cancellationReceipt'));

        $events = $order->refresh()->operational_events;
        $this->assertSame(1, collect($events)->where('code', 'guest_cancellation_requested')->count());
        $this->assertSame(DirectBookingOrderStatus::CancelamentoSolicitado, $order->status);
        $this->assertSame('approved', $order->payment_status);

        $this->getJson('/api/my-direct-booking-orders', ['Authorization' => 'Bearer guest-token'])
            ->assertOk()
            ->assertJsonPath('data.0.cancellationReceipt', $firstResponse->json('cancellationReceipt'));
    }

    public function test_request_requires_authenticated_owner_and_hides_other_guests_order(): void
    {
        $order = $this->confirmedOrder('guest@example.test');

        $this->postJson('/api/my-direct-booking-orders/'.$order->public_reference.'/cancel')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'authentication_required');

        $this->authenticateAs('guest-2', 'different@example.test');
        $this->postJson('/api/my-direct-booking-orders/'.$order->public_reference.'/cancel', [], [
            'Authorization' => 'Bearer guest-token',
        ])->assertNotFound()
            ->assertJsonPath('code', 'direct_booking_not_found');

        $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->refresh()->status);
        $this->assertSame([], $order->operational_events);
    }

    public function test_resume_token_can_request_cancellation_and_replay_keeps_the_receipt(): void
    {
        $this->freezeTime();
        $resumeToken = str_repeat('a', 64);
        $order = $this->confirmedOrder('guest@example.test');
        $order->forceFill([
            'resume_token' => $resumeToken,
            'resume_token_expires_at' => now()->addDay(),
        ])->save();
        $headers = ['X-Checkout-Resume-Token' => $resumeToken];

        $firstResponse = $this->postJson('/api/checkout/'.$order->public_reference.'/cancel', [], $headers)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('success', true)
            ->assertJsonPath('alreadyRequested', false)
            ->assertJsonPath('cancellationReceipt.protocol', 'CANCEL-'.$order->public_reference);

        $this->postJson('/api/checkout/'.$order->public_reference.'/cancel', [], $headers)
            ->assertOk()
            ->assertJsonPath('alreadyRequested', true)
            ->assertJsonPath('cancellationReceipt', $firstResponse->json('cancellationReceipt'));

        $this->getJson('/api/checkout/'.$order->public_reference, $headers)
            ->assertOk()
            ->assertJsonPath('order.cancellationReceipt', $firstResponse->json('cancellationReceipt'));

        $events = $order->refresh()->operational_events;
        $this->assertSame(1, collect($events)->where('code', 'guest_cancellation_requested')->count());
        $this->assertSame('approved', $order->payment_status);
    }

    public function test_resume_token_cancellation_hides_wrong_expired_and_revoked_tokens(): void
    {
        $wrongTokenOrder = $this->confirmedOrder('wrong-token@example.test');
        $wrongTokenOrder->forceFill([
            'resume_token' => str_repeat('b', 64),
            'resume_token_expires_at' => now()->addDay(),
        ])->save();

        $expiredTokenOrder = $this->confirmedOrder('expired-token@example.test');
        $expiredTokenOrder->forceFill([
            'resume_token' => str_repeat('c', 64),
            'resume_token_expires_at' => now()->subSecond(),
        ])->save();

        $revokedResumeToken = str_repeat('e', 64);
        $revokedTokenOrder = $this->confirmedOrder('revoked-token@example.test');
        $revokedTokenOrder->forceFill([
            'resume_token' => $revokedResumeToken,
            'resume_token_expires_at' => now()->addDay(),
        ])->save();

        $revokedHeaders = ['X-Checkout-Resume-Token' => $revokedResumeToken];
        $this->getJson('/api/checkout/'.$revokedTokenOrder->public_reference, $revokedHeaders)
            ->assertOk()
            ->assertJsonPath('order.publicReference', $revokedTokenOrder->public_reference);

        config(['services.hospeda.owner_admin_emails' => ['admin@example.test']]);
        $this->authenticateAs('admin-1', 'admin@example.test');
        $this->postJson('/api/owner/admin/direct-booking-orders/'.$revokedTokenOrder->public_reference.'/revoke-resume-token', [], [
            'Authorization' => 'Bearer guest-token',
        ])->assertOk()
            ->assertJsonPath('status', 'revoked');

        foreach ([
            [$wrongTokenOrder, str_repeat('d', 64)],
            [$expiredTokenOrder, str_repeat('c', 64)],
        ] as [$order, $token]) {
            $this->postJson('/api/checkout/'.$order->public_reference.'/cancel', [], [
                'X-Checkout-Resume-Token' => $token,
            ])->assertNotFound()
                ->assertHeader('Cache-Control', 'no-store, private');
            $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->refresh()->status);
            $this->assertSame([], $order->operational_events);
        }

        $this->postJson('/api/checkout/'.$revokedTokenOrder->public_reference.'/cancel', [], $revokedHeaders)
            ->assertNotFound()
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(DirectBookingOrderStatus::Confirmado, $revokedTokenOrder->refresh()->status);
        $this->assertSame(1, collect($revokedTokenOrder->operational_events)->where('event', 'visitor_resume_token_revoked')->count());
        $this->assertSame(0, collect($revokedTokenOrder->operational_events)->where('code', 'guest_cancellation_requested')->count());
    }

    private function authenticateAs(string $id, string $email): void
    {
        config([
            'services.supabase.url' => 'https://supabase.test',
            'services.supabase.anon_key' => 'test-anon-key',
        ]);

        Http::fake([
            'https://supabase.test/auth/v1/user' => Http::response([
                'id' => $id,
                'email' => $email,
                'email_confirmed_at' => now()->toISOString(),
                'user_metadata' => ['full_name' => 'Test Guest'],
            ]),
        ]);
    }

    private function confirmedOrder(string $email): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::Confirmado,
            'idempotency_key' => 'cancellation-'.bin2hex(random_bytes(12)),
            'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'JQ08G',
            'stays_listing_id' => 'JQ08G',
            'reservation_status' => 'booked',
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-13',
            'guests' => ['adults' => 2],
            'guest_name' => 'Test Guest',
            'guest_email' => $email,
            'guest_phone' => '+5511999999999',
            'quote_total' => '3001.00',
            'currency' => 'BRL',
            'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1',
            'accepted_terms_snapshot' => ['version' => 'terms-test-1'],
            'terms_accepted_at' => now(),
            'payment_status' => 'approved',
            'operational_events' => [],
        ]);
    }
}
