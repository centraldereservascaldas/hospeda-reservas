<?php

namespace Tests\Feature;

use App\Services\ImobSysPreReservationClient;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class ImobSysPreReservationClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.partner_api.base_url' => 'https://api.example.test', 'services.partner_api.reservation_key' => 'reservation-secret', 'services.partner_api.reservations_enabled' => true]);
        Http::preventStrayRequests();
    }

    public function test_accepts_only_matching_supplier_confirmation(): void
    {
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52300, 'currency' => 'BRL']], 201)]);
        $result = app(ImobSysPreReservationClient::class)->create(['acceptedTotalCents' => 52300], 'request-order-123456');
        $this->assertSame('1600', $result['id']);
        Http::assertSent(fn (Request $request): bool => $request->hasHeader('Idempotency-Key', 'request-order-123456') && $request->hasHeader('Authorization', 'Bearer reservation-secret'));
        Http::assertSentCount(1);
    }

    public function test_rejects_mismatched_total_without_retrying(): void
    {
        Http::fake(['api.example.test/*' => Http::response(['success' => true, 'data' => ['id' => '1600', 'status' => 'pre_reservation_created', 'amountCents' => 52301, 'currency' => 'BRL']], 201)]);
        try {
            app(ImobSysPreReservationClient::class)->create(['acceptedTotalCents' => 52300], 'request-order-123456');
            $this->fail('A different total must require review.');
        } catch (RuntimeException) {
            Http::assertSentCount(1);
        }
    }

    public function test_disabled_flag_prevents_request(): void
    {
        config(['services.partner_api.reservations_enabled' => false]);
        try {
            app(ImobSysPreReservationClient::class)->create(['acceptedTotalCents' => 52300], 'request-order-123456');
            $this->fail('The disabled flag must prevent the call.');
        } catch (RuntimeException) {
            Http::assertNothingSent();
        }
    }

    public function test_read_only_key_is_never_used_to_create_a_reservation(): void
    {
        config(['services.partner_api.key' => 'read-only-key', 'services.partner_api.reservation_key' => '']);
        try {
            app(ImobSysPreReservationClient::class)->create(['acceptedTotalCents' => 52300], 'request-order-123456');
            $this->fail('A reservation-specific credential is required.');
        } catch (RuntimeException) {
            Http::assertNothingSent();
        }
    }
}
