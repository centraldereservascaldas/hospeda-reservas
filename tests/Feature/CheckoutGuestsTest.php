<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Services\DirectStaysReservationMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CheckoutGuestsTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_order_saves_guests_in_matching_reservation_and_preserves_note(): void
    {
        $order = $this->order();
        $note = 'CRCN_DIRECT_ORDER:'.$order->id."\nObservação existente";
        $reservation = ['_id' => 'reservation-1', '_idlisting' => 'JQ08G', '_idclient' => 'client-1', 'type' => 'booked', 'checkInDate' => '2026-11-10', 'checkOutDate' => '2026-11-13'];
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$note, $reservation) {
            if ($request->method() === 'PATCH') {
                $note = $request['internalNote'];
            }

            return Http::response([...$reservation, 'internalNote' => $note]);
        });
        $payload = ['holder' => ['name' => 'Pessoa Exemplo', 'document' => '12345678909', 'phone' => '11999999999'], 'companions' => [['name' => 'Outra Pessoa', 'document' => '1234']]];
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload, ['X-Checkout-Resume-Token' => str_repeat('a', 64)])->assertOk()->assertJsonPath('success', true);
        $this->assertStringContainsString("\nObservação existente", $note);
        $this->assertStringContainsString('Acompanhante 1: Outra Pessoa', $note);
        $this->assertTrue(app(DirectStaysReservationMatcher::class)->matchesIdentity([...$reservation, 'internalNote' => $note], $order));
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload, ['X-Checkout-Resume-Token' => str_repeat('a', 64)])->assertOk();
        $this->assertSame(1, substr_count($note, '[CRCN DADOS HOSPEDES INICIO]'));
        $payload['companions'] = [];
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload, ['X-Checkout-Resume-Token' => str_repeat('a', 64)])->assertOk();
        $this->assertStringNotContainsString('Acompanhante 1:', $note);
    }

    public function test_unpaid_or_unauthorized_orders_do_not_contact_stays(): void
    {
        $order = $this->order();
        Http::fake();
        $payload = ['holder' => ['name' => 'Pessoa Exemplo', 'document' => '12345678909', 'phone' => '11999999999'], 'companions' => []];
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload)->assertNotFound();
        $order->update(['payment_status' => 'pending']);
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload, ['X-Checkout-Resume-Token' => str_repeat('a', 64)])->assertStatus(409);
        Http::assertNothingSent();
    }

    public function test_more_guests_than_booked_is_rejected_without_calling_stays(): void
    {
        $order = $this->order();
        Http::fake();
        $payload = ['holder' => ['name' => 'Pessoa Exemplo', 'document' => '12345678909', 'phone' => '11999999999'], 'companions' => [
            ['name' => 'Pessoa 1', 'document' => '1234'], ['name' => 'Pessoa 2', 'document' => '5678'],
        ]];
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload, ['X-Checkout-Resume-Token' => str_repeat('a', 64)])->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_failure_to_verify_stays_write_does_not_report_success(): void
    {
        $order = $this->order();
        $reservation = ['_id' => 'reservation-1', '_idlisting' => 'JQ08G', '_idclient' => 'client-1', 'type' => 'booked', 'checkInDate' => '2026-11-10', 'checkOutDate' => '2026-11-13', 'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id];
        Http::fake(fn (Request $request) => Http::response($reservation, $request->method() === 'PATCH' ? 503 : 200));
        $payload = ['holder' => ['name' => 'Pessoa Exemplo', 'document' => '12345678909', 'phone' => '11999999999'], 'companions' => []];
        $this->postJson('/api/checkout/'.$order->public_reference.'/guests', $payload, ['X-Checkout-Resume-Token' => str_repeat('a', 64)])->assertStatus(503)->assertJsonPath('success', false);
    }

    private function order(): DirectBookingOrder
    {
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);

        return DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::Confirmado, 'idempotency_key' => 'guest-test', 'public_reference' => str_repeat('b', 40),
            'resume_token' => str_repeat('a', 64), 'resume_token_expires_at' => now()->addDay(), 'request_fingerprint' => str_repeat('c', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G', 'stays_client_id' => 'client-1', 'stays_reservation_id' => 'reservation-1',
            'reservation_status' => 'booked', 'payment_status' => 'approved', 'check_in' => '2026-11-10', 'check_out' => '2026-11-13',
            'guests' => ['adults' => 2, 'children' => 0, 'infants' => 0], 'guest_name' => 'Pessoa Exemplo', 'guest_email' => 'guest@example.test',
            'guest_phone' => '11999999999', 'quote_total' => '100.00', 'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'terms',
            'accepted_terms_snapshot' => ['version' => 'terms'], 'terms_accepted_at' => now(), 'operational_events' => [],
        ]);
    }
}
