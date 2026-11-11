<?php

namespace Tests\Feature;

use App\Console\Commands\InspectExistingBootstrap;
use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\ExistingReservationBootstrapRecovery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExistingReservationBootstrapRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_unpaid_receivable_can_only_resume_in_the_original_session(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $this->fakeStays($reservation, $payment);
        $report = app(ExistingReservationBootstrapRecovery::class)->inspect($order);

        $this->assertSame(['state' => 'original_session_resume_only', 'selected_method' => 'pix', 'original_session_may_resume' => true], $report);
        $this->assertStringNotContainsString($order->resume_token, json_encode($report));
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_expired_order_does_not_release_or_modify_its_pending_receivable(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $order->update(['expires_at' => now()->subMinute()]);
        $this->fakeStays($reservation, $payment);

        $this->assertSame('expired_receivable_requires_review', app(ExistingReservationBootstrapRecovery::class)->inspect($order)['state']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_unknown_attempt_or_receivable_never_authorizes_a_new_payment(): void
    {
        [$order] = $this->fixture();
        $order->paymentAttempts()->create(['idempotency_key' => 'recovery-attempt-test-123', 'request_fingerprint' => str_repeat('b', 64), 'payment_method' => 'pix', 'payment_method_id' => 'pix', 'status' => 'unknown', 'amount' => '197.50', 'currency' => 'BRL']);
        Http::preventStrayRequests();
        Http::fake();

        $report = app(ExistingReservationBootstrapRecovery::class)->inspect($order);
        $this->assertSame('payment_reconciliation_required', $report['state']);
        $this->assertFalse($report['original_session_may_resume']);
        Http::assertNothingSent();
    }

    public function test_uncertain_receivable_requires_review_without_changing_stays(): void
    {
        [$order] = $this->fixture();
        $order->staysActions()->update(['status' => 'attention_required']);
        Http::preventStrayRequests();
        Http::fake();

        $report = app(ExistingReservationBootstrapRecovery::class)->inspect($order);
        $this->assertSame('receivable_reconciliation_required', $report['state']);
        $this->assertFalse($report['original_session_may_resume']);
        Http::assertNothingSent();
    }

    public function test_operator_command_outputs_only_redacted_state(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $this->fakeStays($reservation, $payment);
        $this->artisan(InspectExistingBootstrap::class, ['order' => $order->id])
            ->expectsOutput('{"state":"original_session_resume_only","selected_method":"pix","original_session_may_resume":true}')
            ->assertExitCode(0);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_changed_stays_receivable_requires_review(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $this->fakeStays($reservation, array_replace($payment, ['_f_val' => 100]));
        $this->assertSame('receivable_changed_requires_review', app(ExistingReservationBootstrapRecovery::class)->inspect($order)['state']);
    }

    public function test_financial_view_marked_paid_prevents_resuming_an_unpaid_local_order(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(match (true) {
            str_contains($request->url(), '/finance/accounting-transactions/') => ['_id' => $payment['_id'], 'reserveId' => $reservation['_id'], 'bankAccountId' => $payment['_idpaymentProvider'], 'type' => 'credit', 'paid' => true, '_mcval' => ['BRL' => 197.50]],
            str_ends_with($request->url(), '/payments') => [$payment],
            default => $reservation,
        }));

        $this->assertSame('receivable_changed_requires_review', app(ExistingReservationBootstrapRecovery::class)->inspect($order)['state']);
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_revoked_approval_requires_review(): void
    {
        [$order, $reservation, $payment] = $this->fixture();
        $this->fakeStays($reservation, $payment);
        config(['direct-booking.experimental_existing_approved_balances' => []]);
        $this->assertSame('approval_requires_review', app(ExistingReservationBootstrapRecovery::class)->inspect($order)['state']);
    }

    private function fakeStays(array $reservation, array $payment): void
    {
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response(match (true) {
            str_contains($request->url(), '/finance/accounting-transactions/') => ['_id' => $payment['_id'], 'reserveId' => $reservation['_id'], 'bankAccountId' => $payment['_idpaymentProvider'], 'type' => 'credit', 'paid' => false, '_mcval' => ['BRL' => 197.50]],
            str_ends_with($request->url(), '/payments') => [$payment],
            default => $reservation,
        }));
    }

    private function fixture(): array
    {
        $id = str_repeat('c', 24);
        $provider = str_repeat('f', 24);
        $paymentId = str_repeat('a', 24);
        $snapshot = ['_id' => $id, '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 4, 'currency' => 'BRL', 'reservation_type' => 'reserved', 'partner_name' => 'api booking.com', 'approval_version' => 'review-1', 'reservation_total_cents' => 39500, 'pending_amount_cents' => 19750, 'reported_paid_present' => false, 'reported_paid_cents' => null, 'payment_id' => $paymentId, 'pending_provider_id' => $provider, 'bootstrap_receivable' => true, 'selected_payment_method' => 'pix', 'selected_installments' => null];
        $approval = array_intersect_key($snapshot, array_flip(['_idclient', '_idlisting', 'checkInDate', 'checkOutDate', 'guests', 'currency', 'reservation_type', 'partner_name', 'reservation_total_cents', 'pending_amount_cents']));
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.enabled' => true, 'direct-booking.payments_enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.experimental_existing_receivable_creation_enabled' => true, 'direct-booking.experimental_existing_approved_balances' => [$id => ['version' => 'review-1', 'expires_at' => '2030-01-01T00:00:00+00:00', ...$approval]]]);
        $reservation = ['_id' => $id, '_idclient' => 'client', '_idlisting' => 'listing', 'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 4, 'type' => 'reserved', 'partner' => ['name' => 'API booking.com'], 'price' => ['currency' => 'BRL', '_f_total' => 395]];
        $payment = ['_id' => $paymentId, '_idpaymentProvider' => $provider, 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva'];
        $order = DirectBookingOrder::query()->create(['status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'recovery-order-test', 'request_fingerprint' => str_repeat('a', 64), 'public_reference' => str_repeat('z', 40), 'resume_token' => str_repeat('s', 64), 'resume_token_expires_at' => now()->addDay(), 'listing_id' => 'listing', 'stays_listing_id' => 'listing', 'stays_client_id' => 'client', 'stays_reservation_id' => $id, 'reservation_status' => 'reserved', 'check_in' => '2030-11-13', 'check_out' => '2030-11-16', 'guests' => ['adults' => 4, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Test', 'guest_email' => 'test@example.test', 'guest_phone' => '11999999999', 'quote_total' => '197.50', 'currency' => 'BRL', 'quote_snapshot' => ['existing_reservation' => $snapshot], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'expires_at' => now()->addHour(), 'operational_events' => []]);
        $order->staysActions()->create(['action_type' => 'experimental_create_receivable', 'status' => 'succeeded', 'idempotency_key' => 'recovery-action-test', 'external_id' => $paymentId, 'request_snapshot' => ['provider_id' => $provider, 'method' => 'pix', 'installments' => null, 'amount_cents' => 19750]]);

        return [$order, $reservation, $payment];
    }
}
