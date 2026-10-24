<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
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

        Mail::shouldReceive('to')->once()->andThrow(new RuntimeException('transport unavailable'));

        try {
            (new SendDirectBookingConfirmationEmail($email->id))->handle();
            $this->fail('The transport exception should be rethrown for the queue worker.');
        } catch (RuntimeException $exception) {
            $this->assertSame('transport unavailable', $exception->getMessage());
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
}
