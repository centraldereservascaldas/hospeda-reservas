<?php

namespace Tests\Feature;

use App\Services\ExistingReservationPaymentChannels;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExistingReservationPaymentChannelsTest extends TestCase
{
    public function test_both_methods_require_the_external_site_payment_channel(): void
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
        Http::fake(['*' => Http::response(['_id' => $id, 'status' => 'active', 'internalName' => 'Cielo Site Externo'])]);
        $service = app(ExistingReservationPaymentChannels::class);
        $this->assertSame($id, $service->verifiedProvider($service->snapshot(), 'pix', null));
    }

    public function test_pix_and_card_use_the_same_active_external_site_channel(): void
    {
        $pix = str_repeat('f', 24);
        $cards = array_combine(range(1, 6), array_map(fn (int $n): string => str_repeat((string) $n, 24), range(1, 6)));
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test', 'direct-booking.stays_cielo_pix_provider_id' => $pix, 'direct-booking.stays_cielo_card_provider_ids' => $cards]);
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            $id = basename($request->url());
            $name = 'Cielo Site Externo';

            return Http::response(['_id' => $id, 'status' => 'active', 'internalName' => $name]);
        });
        $channels = app(ExistingReservationPaymentChannels::class);
        $id = str_repeat('a', 24);
        $this->assertSame(['methods' => ['pix', 'card'], 'card_installments' => range(1, 6)], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id, '_idpaymentProvider' => $pix]], $id));
        $this->assertSame(['methods' => [], 'card_installments' => []], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id, '_idpaymentProvider' => $cards[6]]], $id));
        $this->assertSame(['methods' => [], 'card_installments' => []], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id, '_idpaymentProvider' => str_repeat('b', 24)]], $id));
        $this->assertSame(['methods' => [], 'card_installments' => []], $channels->availableForReceivable(['pix', 'card'], [['_id' => $id], ['_id' => $id]], $id));
    }
}
