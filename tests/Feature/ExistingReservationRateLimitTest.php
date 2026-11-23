<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ExistingReservationRateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
    }

    public function test_a_checkout_journey_has_separate_budgets_for_each_endpoint(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.10']);

        for ($i = 0; $i < 5; $i++) {
            $this->getJson('/api/existing-reservations/AA001/checkout-summary')->assertNotFound();
        }

        $this->postJson('/api/existing-reservations/AA001/recovery-credential')->assertOk();
        $this->postJson('/api/existing-reservations/AA001/recover', [])->assertUnprocessable();
        $this->postJson('/api/existing-reservations/AA001/checkout', [])->assertUnprocessable();
        $this->getJson('/api/existing-reservations/AA001/checkout-summary')->assertNotFound();
    }

    public function test_summary_limit_applies_to_an_ip_across_different_reservation_codes(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.11']);

        for ($i = 0; $i < 10; $i++) {
            $this->getJson(sprintf('/api/existing-reservations/AA%03d/checkout-summary', $i))->assertNotFound();
        }

        $this->getJson('/api/existing-reservations/AA010/checkout-summary')->assertTooManyRequests();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.12'])
            ->getJson('/api/existing-reservations/AA010/checkout-summary')->assertNotFound();
    }

    public function test_global_ip_budget_applies_across_all_existing_reservation_endpoints(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.13']);

        for ($i = 0; $i < 10; $i++) {
            $this->getJson(sprintf('/api/existing-reservations/AB%03d/checkout-summary', $i))->assertNotFound();
            $this->postJson(sprintf('/api/existing-reservations/AB%03d/recovery-credential', $i))->assertOk();
            $this->postJson(sprintf('/api/existing-reservations/AB%03d/recover', $i), [])->assertUnprocessable();
        }

        $this->postJson('/api/existing-reservations/AB010/checkout', [])->assertTooManyRequests();
    }
}
