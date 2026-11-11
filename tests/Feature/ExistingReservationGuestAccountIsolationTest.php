<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\GuestProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExistingReservationGuestAccountIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_reservation_payment_does_not_replace_booking_status_or_auto_cancel(): void
    {
        $id = str_repeat('a', 24);
        $record = ['id' => 'ZX91K', '_id' => $id, '_idclient' => 'stays-client-1', '_idlisting' => 'JQ08G', 'checkInDate' => '2030-11-10', 'checkOutDate' => '2030-11-13', 'type' => 'booked', 'price' => ['_f_total' => 395]];
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        Http::preventStrayRequests();
        Http::fake([
            '*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']]),
            '*/booking/clients/stays-client-1' => Http::response(['client' => ['reservations' => [$record]]]),
            '*/booking/reservations/ZX91K' => Http::response($record),
        ]);
        GuestProfile::query()->create(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'full_name' => 'Guest Example', 'stays_client_id' => 'stays-client-1']);
        DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::PreReservado, 'idempotency_key' => 'existing-account-order', 'request_fingerprint' => str_repeat('b', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G', 'stays_reservation_id' => $id, 'check_in' => '2030-11-10', 'check_out' => '2030-11-13',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Payer', 'guest_email' => 'payer@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '197.50', 'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'stays_existing', 'public_reference' => str_repeat('z', 40), 'operational_events' => [],
        ]);

        $this->withToken('valid-access-token')->getJson('/api/my-reservations')
            ->assertOk()->assertJsonPath('data.0.status', 'confirmed')->assertJsonPath('data.0.directBookingReference', null);
        $this->withToken('valid-access-token')->postJson('/api/my-reservations/ZX91K/cancel')
            ->assertStatus(409)->assertJsonPath('code', 'direct_booking_cancellation_requires_support');
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'stays.net') && $request->method() !== 'GET');
    }

    #[DataProvider('websiteReservationIdentifiers')]
    public function test_website_checkout_still_shows_its_reference_and_accepts_cancellation_request(string $storedId): void
    {
        $id = str_repeat('a', 24);
        $record = ['id' => 'ZX91K', '_id' => $id, '_idclient' => 'stays-client-1', '_idlisting' => 'JQ08G', 'checkInDate' => '2030-11-10', 'checkOutDate' => '2030-11-13', 'type' => 'booked', 'price' => ['_f_total' => 395]];
        config(['services.supabase.url' => 'https://auth.example.test', 'services.supabase.anon_key' => 'public-key', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test']);
        Http::preventStrayRequests();
        Http::fake([
            '*/auth/v1/user' => Http::response(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'email' => 'guest@example.test', 'email_confirmed_at' => '2026-01-01T00:00:00Z', 'user_metadata' => ['full_name' => 'Guest Example']]),
            '*/booking/clients/stays-client-1' => Http::response(['client' => ['reservations' => [$record]]]),
            '*/booking/reservations/ZX91K' => Http::response($record),
        ]);
        GuestProfile::query()->create(['id' => '575c8054-6646-443c-bf62-07945019a32f', 'full_name' => 'Guest Example', 'stays_client_id' => 'stays-client-1']);
        $order = DirectBookingOrder::query()->create([
            'status' => DirectBookingOrderStatus::Confirmado, 'payment_status' => 'approved', 'idempotency_key' => 'website-account-order', 'request_fingerprint' => str_repeat('b', 64),
            'listing_id' => 'JQ08G', 'stays_listing_id' => 'JQ08G', 'stays_reservation_id' => $storedId, 'check_in' => '2030-11-10', 'check_out' => '2030-11-13',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0, 'pets' => 0], 'guest_name' => 'Guest Example', 'guest_email' => 'guest@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '395.00', 'currency' => 'BRL', 'quote_snapshot' => [], 'accepted_terms_version' => 'test', 'accepted_terms_snapshot' => [],
            'terms_accepted_at' => now(), 'origin' => 'website', 'public_reference' => str_repeat('z', 40), 'operational_events' => [],
        ]);

        $this->withToken('valid-access-token')->getJson('/api/my-reservations')
            ->assertOk()->assertJsonPath('data.0.status', 'confirmed')->assertJsonPath('data.0.directBookingReference', str_repeat('z', 40));
        $this->withToken('valid-access-token')->postJson('/api/my-reservations/ZX91K/cancel')
            ->assertOk()->assertJsonPath('cancellationStatus', 'requested');
        $this->assertSame(DirectBookingOrderStatus::CancelamentoSolicitado, $order->fresh()->status);
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'stays.net') && $request->method() !== 'GET');
    }

    public static function websiteReservationIdentifiers(): array
    {
        return ['internal ID' => [str_repeat('a', 24)], 'short ID' => ['ZX91K']];
    }
}
