<?php

namespace Tests\Feature;

use App\Services\ExistingReservationPaymentChannels;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExistingReservationPaymentChannelsTest extends TestCase
{
    public function test_methods_remain_unavailable_without_separate_configured_channels(): void
    {
        config(['direct-booking.stays_cielo_pix_provider_id' => null, 'direct-booking.stays_cielo_card_provider_ids' => []]);
        $this->assertSame([], app(ExistingReservationPaymentChannels::class)->availableMethods(['pix', 'card']));
    }

    public function test_provider_must_match_snapshot_and_active_named_channel(): void
    {
        $id = str_repeat('f', 24);
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.stays_cielo_pix_provider_id' => $id]);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['_id' => $id, 'status' => 'active', 'internalName' => 'PIX'])]);
        $service = app(ExistingReservationPaymentChannels::class);
        $snapshot = $service->snapshot();
        $this->assertNull($service->verifiedProvider($snapshot, 'pix', null));
        $this->assertNull($service->verifiedProvider(['pix' => str_repeat('e', 24)], 'pix', null));
    }

    public function test_named_active_pix_channel_is_accepted(): void
    {
        $id = str_repeat('f', 24);
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.stays_cielo_pix_provider_id' => $id]);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['_id' => $id, 'status' => 'active', 'internalName' => 'Pix API Cielo'])]);
        $service = app(ExistingReservationPaymentChannels::class);
        $this->assertSame($id, $service->verifiedProvider($service->snapshot(), 'pix', null));
    }

    public function test_available_methods_match_only_the_receivable_provider(): void
    {
        $pix = str_repeat('f', 24);
        $cards = array_combine(range(1, 6), array_map(fn (int $n): string => str_repeat((string) $n, 24), range(1, 6)));
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.stays_cielo_pix_provider_id' => $pix, 'direct-booking.stays_cielo_card_provider_ids' => $cards]);
        Http::preventStrayRequests();
        Http::fake(function ($request) use ($pix, $cards) {
            $id = basename($request->url());
            $name = $id === $pix ? 'Pix API Cielo' : 'Cartão API Cielo '.array_search($id, $cards, true).'x';

            return Http::response(['_id' => $id, 'status' => 'active', 'internalName' => $name]);
        });
        config(['direct-booking.experimental_existing_ledger_audit_enabled' => true]);
        $channels = app(ExistingReservationPaymentChannels::class);
        $id = str_repeat('a', 24);
        $this->assertSame(['methods' => ['pix'], 'card_installments' => []], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id, '_idpaymentProvider' => $pix]], $id));
        $this->assertSame(['methods' => ['card'], 'card_installments' => [6]], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id, '_idpaymentProvider' => $cards[6]]], $id));
        $this->assertSame(['methods' => [], 'card_installments' => []], $channels->availableForReceivable(['pix'], [['_id' => $id, '_idpaymentProvider' => $cards[6]]], $id));
        $this->assertSame(['methods' => [], 'card_installments' => []], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id, '_idpaymentProvider' => str_repeat('b', 24)]], $id));
        $this->assertSame(['methods' => [], 'card_installments' => []], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id], ['_id' => $id]], $id));
    }
}
