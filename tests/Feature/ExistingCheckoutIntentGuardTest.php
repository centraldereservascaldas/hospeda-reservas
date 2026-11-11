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

    private function send(string $key, array $payload, string $code = 'ZX91K'): \Symfony\Component\HttpFoundation\Response
    {
        $request = Request::create('/api/existing-reservations/ZX91K/checkout', 'POST', $payload, [], [], ['HTTP_IDEMPOTENCY_KEY' => $key]);
        $route = new \Illuminate\Routing\Route('POST', '/', []);
        $route->bind($request);
        $route->setParameter('code', $code);
        $request->setRouteResolver(fn () => $route);

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

    public function test_changed_valid_payload_and_legacy_claim_fail_closed(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $key = 'bound-valid-intent-key-12345';
        $this->assertSame(201, $this->send($key, $this->valid())->getStatusCode());
        $changed = $this->valid();
        $changed['guest']['email'] = 'other@example.test';
        $this->assertSame(409, $this->send($key, $changed)->getStatusCode());
        $this->assertSame(201, $this->send($key, $this->valid())->getStatusCode());
        $row = DB::table('existing_checkout_intents')->first();
        $this->assertSame(64, strlen($row->payload_hmac));
        $this->assertStringNotContainsString('guest@example.test', json_encode($row));
        $legacy = 'legacy-claimed-intent-key-123';
        DB::table('existing_checkout_intents')->insert(['key_hash' => hash('sha256', $legacy), 'state' => 'claimed', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame(409, $this->send($legacy, $this->valid())->getStatusCode());
    }
    public function test_binding_matches_service_equivalence_and_reservation_code(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $key = 'equivalence-intent-key-12345';
        $payload = $this->valid();
        $this->assertSame(201, $this->send($key, $payload)->getStatusCode());
        $payload['acceptedPayment'] = 'yes';
        $payload['installments'] = null;
        $this->assertSame(201, $this->send($key, $payload)->getStatusCode());
        $this->assertSame(409, $this->send($key, $payload, 'AB123')->getStatusCode());
        $payload['expectedBalanceCents'] = '10000';
        $this->assertSame(409, $this->send($key, $payload)->getStatusCode());
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

    public function test_downstream_exception_does_not_remove_the_claim(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $key = 'failed-downstream-intent-key-123';
        $request = Request::create('/api/existing-reservations/ZX91K/checkout', 'POST', $this->valid(), [], [], ['HTTP_IDEMPOTENCY_KEY' => $key]);
        $route = new \Illuminate\Routing\Route('POST', '/', []);
        $route->bind($request);
        $route->setParameter('code', 'ZX91K');
        $request->setRouteResolver(fn () => $route);

        try {
            app(GuardExistingCheckoutIntent::class)->handle($request, function () {
                throw new \RuntimeException('downstream failed');
            });
            $this->fail('The downstream exception should propagate.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('downstream failed', $exception->getMessage());
        }

        $this->assertSame('claimed', DB::table('existing_checkout_intents')->where('key_hash', hash('sha256', $key))->value('state'));
        $this->assertSame(409, $this->send($key, [])->getStatusCode());
    }

    public function test_rejected_intent_stays_rejected_after_a_long_delay(): void
    {
        config(['direct-booking.experimental_existing_intent_guard_enabled' => true]);
        $key = 'old-rejected-intent-key-123';
        $this->assertSame(422, $this->send($key, [])->getStatusCode());

        $this->travel(10)->years();

        $this->assertSame(409, $this->send($key, $this->valid())->getStatusCode());
        $this->assertSame('rejected', DB::table('existing_checkout_intents')->where('key_hash', hash('sha256', $key))->value('state'));
    }
}
