<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Exceptions\DirectBookingEmailDeliveryException;
use App\Jobs\SendDirectBookingConfirmationEmail;
use App\Mail\DirectBookingConfirmed;
use App\Models\DirectBookingEmail;
use App\Models\DirectBookingOrder;
use App\Services\DirectBookingEmailDispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\TestCase;

class DirectBookingEmailLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['direct-booking.send_confirmation_email' => true]);
    }

    public function test_freshly_queued_confirmation_is_sent_once_even_if_job_runs_twice(): void
    {
        Queue::fake();
        Mail::fake();
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::Confirmado,
            'idempotency_key' => 'order-email-lifecycle',
            'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2], 'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website',
            'payment_status' => 'approved', 'reservation_status' => 'booked',
            'operational_events' => [],
        ]);
        $email = DirectBookingEmail::query()->create([
            'direct_booking_order_id' => $order->id,
            'notification_type' => DirectBookingEmail::TYPE_BOOKING_CONFIRMED,
            'status' => 'pending',
        ]);

        $this->assertTrue(app(DirectBookingEmailDispatcher::class)->dispatch($email->id, allowFreshPending: true));
        Queue::assertPushed(SendDirectBookingConfirmationEmail::class, 1);
        $this->assertSame('queued', $email->refresh()->status);

        $job = new SendDirectBookingConfirmationEmail($email->id);
        $job->handle();
        $this->assertSame('sent', $email->refresh()->status);
        Mail::assertSent(DirectBookingConfirmed::class, 1);

        $job->handle();
        Mail::assertSent(DirectBookingConfirmed::class, 1);
        $this->assertSame(1, $email->refresh()->attempts);
    }

    public function test_transport_failure_is_retried_once_after_backoff_and_marked_sent(): void
    {
        $this->travelTo(now()->startOfSecond());
        Queue::fake([SendDirectBookingConfirmationEmail::class]);
        $mailFake = Mail::fake();
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::Confirmado,
            'idempotency_key' => 'order-email-transport-retry',
            'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('b', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2], 'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website',
            'payment_status' => 'approved', 'reservation_status' => 'booked',
            'operational_events' => [],
        ]);
        $email = DirectBookingEmail::query()->create([
            'direct_booking_order_id' => $order->id,
            'notification_type' => DirectBookingEmail::TYPE_BOOKING_CONFIRMED,
            'status' => 'queued',
            'queued_at' => now(),
        ]);

        $guestEmailSentinel = 'guest-sensitive@example.test';
        $credentialSentinel = 'provider-secret-sentinel';
        $responseSentinel = 'provider-response-sentinel';
        Mail::shouldReceive('to')->once()->andThrow(new RuntimeException(
            "transport failed for {$guestEmailSentinel}; credential={$credentialSentinel}; response={$responseSentinel}",
        ));

        try {
            (new SendDirectBookingConfirmationEmail($email->id))->handle();
            $this->fail('The sanitized delivery exception should reach the queue worker.');
        } catch (DirectBookingEmailDeliveryException $exception) {
            $this->assertNull($exception->getPrevious());
            $this->assertStringNotContainsString($guestEmailSentinel, $exception->getMessage());
            $this->assertStringNotContainsString($credentialSentinel, $exception->getMessage());
            $this->assertStringNotContainsString($responseSentinel, $exception->getMessage());
        } finally {
            Mail::swap($mailFake);
        }

        $email->refresh();
        $this->assertSame('failed', $email->status);
        $this->assertSame('mail_delivery_failed', $email->error_code);
        $this->assertSame(1, $email->attempts);
        $this->assertSame(now()->addSeconds(30)->toDateTimeString(), $email->next_attempt_at?->toDateTimeString());

        $this->travel(29)->seconds();
        $this->artisan('direct-booking:recover-confirmation-emails')->assertSuccessful();
        Queue::assertNothingPushed();
        $this->assertSame('failed', $email->refresh()->status);

        $this->travel(1)->seconds();
        $this->artisan('direct-booking:recover-confirmation-emails')->assertSuccessful();
        Queue::assertPushed(SendDirectBookingConfirmationEmail::class, 1);
        $this->assertSame('queued', $email->refresh()->status);

        (new SendDirectBookingConfirmationEmail($email->id))->handle();
        $this->assertSame('sent', $email->refresh()->status);
        $this->assertSame(2, $email->attempts);
        $this->assertNotNull($email->sent_at);
        Mail::assertSent(DirectBookingConfirmed::class, 1);

        $this->artisan('direct-booking:recover-confirmation-emails')->assertSuccessful();
        Queue::assertPushed(SendDirectBookingConfirmationEmail::class, 1);
    }

    public function test_confirmation_emails_older_than_retry_window_are_terminal_and_not_requeued(): void
    {
        $this->travelTo(now()->startOfSecond());

        $failedOrder = $this->createConfirmedOrder('order-email-expired-failed');
        $queuedOrder = $this->createConfirmedOrder('order-email-expired-queued');
        $failedEmail = DirectBookingEmail::query()->create([
            'direct_booking_order_id' => $failedOrder->id,
            'notification_type' => DirectBookingEmail::TYPE_BOOKING_CONFIRMED,
            'status' => 'failed',
            'next_attempt_at' => now()->subMinute(),
        ]);
        $queuedEmail = DirectBookingEmail::query()->create([
            'direct_booking_order_id' => $queuedOrder->id,
            'notification_type' => DirectBookingEmail::TYPE_BOOKING_CONFIRMED,
            'status' => 'queued',
            'queued_at' => now()->subHours(25),
        ]);
        foreach ([$failedEmail, $queuedEmail] as $email) {
            $email->forceFill(['created_at' => now()->subHours(25)])->save();
        }

        Queue::fake();

        $this->artisan('direct-booking:recover-confirmation-emails')->assertSuccessful();

        foreach ([$failedEmail, $queuedEmail] as $email) {
            $this->assertDatabaseHas('direct_booking_emails', [
                'id' => $email->id,
                'status' => 'failed',
                'error_code' => 'mail_retry_window_expired',
                'next_attempt_at' => null,
                'queued_at' => null,
            ]);
        }
        Queue::assertNothingPushed();
    }

    private function createConfirmedOrder(string $idempotencyKey): DirectBookingOrder
    {
        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::Confirmado,
            'idempotency_key' => $idempotencyKey,
            'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => hash('sha256', $idempotencyKey),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G',
            'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2], 'guest_name' => 'Test Guest',
            'guest_email' => 'test@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '3001.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'terms-test-1', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website',
            'payment_status' => 'approved', 'reservation_status' => 'booked',
            'operational_events' => [],
        ]);
    }
}
