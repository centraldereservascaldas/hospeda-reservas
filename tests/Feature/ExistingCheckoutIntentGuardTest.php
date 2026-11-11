<?php

namespace Tests\Feature;

use App\Http\Middleware\GuardExistingCheckoutIntent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ExistingCheckoutIntentGuardTest extends TestCase
{
    use RefreshDatabase;

    private function send(string $key, array $payload): \Symfony\Component\HttpFoundation\Response
    {
        $request = Request::create('/api/existing-reservations/ZX91K/checkout', 'POST', $payload, [], [], ['HTTP_IDEMPOTENCY_KEY' => $key]);

        return app(GuardExistingCheckoutIntent::class)->handle($request, fn () => response()->json(['accepted' => true], 201));
    }

    private function valid(): array
    {
        return ['expectedBalanceCents' => 10000, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Guest', 'email' => 'guest@example.test', 'phone' => '11999999999'], 'acceptedPayment' => true];
    }

    public function test_invalid_first_retires_key_and_prevents_late_valid_request(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $key = 'invalid-first-intent-key-123';
        $this->assertSame(422, $this->send($key, [])->getStatusCode());
        $this->assertSame(409, $this->send($key, $this->valid())->getStatusCode());
        $this->assertSame('rejected', DB::table('existing_checkout_intents')->where('key_hash', hash('sha256', $key))->value('state'));
        $this->assertSame(201, $this->send('corrected-new-intent-key-123', $this->valid())->getStatusCode());
    }

    public function test_valid_first_never_returns_validation_422_for_same_key(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $key = 'valid-first-intent-key-12345';
        $this->assertSame(201, $this->send($key, $this->valid())->getStatusCode());
        $this->assertSame(409, $this->send($key, [])->getStatusCode());
        $this->assertSame(201, $this->send($key, $this->valid())->getStatusCode());
        $stored = json_encode(DB::table('existing_checkout_intents')->get());
        $this->assertStringNotContainsString('guest@example.test', $stored);
        $this->assertStringNotContainsString($key, $stored);
    }

    public function test_disabled_flag_preserves_existing_behavior(): void
    {
        $this->assertFalse(config('direct-booking.experimental_existing_intent_guard_enabled'));
        $this->assertSame(201, $this->send('disabled-guard-intent-123', [])->getStatusCode());
        $this->assertSame(0, DB::table('existing_checkout_intents')->count());
    }

    public function test_route_guard_runs_before_form_request_validation(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $key = 'route-intent-rejection-key-123';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZX91K/checkout', [])
            ->assertStatus(422)->assertJsonValidationErrors(['guest']);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZX91K/checkout', $this->valid())
            ->assertStatus(409)->assertJsonPath('code', 'existing_checkout_intent_conflict');
    }
}
