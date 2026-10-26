<?php

namespace Tests\Feature;

use App\Models\OwnerAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OwnerAccountingDetailsTest extends TestCase
{
    use RefreshDatabase;

    public function test_accounting_details_use_the_reservation_export_owner_fee_for_the_owner_repasse(): void
    {
        config([
            'services.supabase.url' => 'https://auth.example.test',
            'services.supabase.anon_key' => 'public-key',
            'services.stays.client_id' => 'client',
            'services.stays.client_secret' => 'secret',
            'services.stays.base_url' => 'https://crcn.stays.net/external/v1',
        ]);
        Http::preventStrayRequests();
        Http::fake(function (ClientRequest $request): ClientResponse {
            $path = parse_url($request->url(), PHP_URL_PATH);

            return match (true) {
                $path === '/auth/v1/user' => Http::response([
                    'id' => '575c8054-6646-443c-bf62-07945019a32f',
                    'email' => 'owner@example.test',
                    'email_confirmed_at' => '2026-01-01T00:00:00Z',
                    'user_metadata' => ['full_name' => 'Owner Example'],
                ]),
                $path === '/external/v1/finance/owners' => Http::response([[
                    '_id' => 'owner-1',
                    'listings' => [['_id' => 'listing-1', 'id' => 'OH01J']],
                ]]),
                $path === '/external/v1/finance/owners/owner-1/listing-1' => Http::response([
                    '_id' => 'listing-1',
                    'id' => 'OH01J',
                    'accounts' => [[
                        '_id' => 'ledger-1',
                        'date' => '2026-10-27',
                        '_mcval' => ['BRL' => 0.60],
                        'reserveId' => 'reservation-1',
                        'type' => 'credit',
                    ]],
                ]),
                $path === '/external/v1/booking/reservations/reservation-1' => Http::response([
                    'id' => 'QI03J',
                    '_idlisting' => 'listing-1',
                    'checkInDate' => '2026-10-27',
                    'checkOutDate' => '2026-10-30',
                    'price' => [
                        '_f_total' => 95,
                        'hostingDetails' => [
                            '_f_total' => 95,
                            'fees' => [['name' => 'Taxa de Limpeza', '_f_val' => 95]],
                        ],
                    ],
                ]),
                $path === '/external/v1/booking/reservations-export' => Http::response([[
                    '_id' => 'reservation-1',
                    'id' => 'QI03J',
                    'listing' => ['id' => 'OH01J'],
                    'reserveTotal' => 95,
                    'listingInvoiceTotal' => 95,
                    'fee' => [['val' => 95, 'desc' => 'Taxa de Limpeza']],
                    'ownerFee' => [
                        ['val' => 80, 'desc' => 'Taxa de Limpeza'],
                        ['val' => 14.25, 'desc' => 'Taxa do parceiro: API booking.com'],
                    ],
                    'baseAmountForwarding' => 95,
                    'sellPriceCorrected' => 0.75,
                    'companyCommision' => 0.15,
                    'buyPrice' => 0.60,
                    'totalForwardFee' => 94.25,
                ]]),
                default => Http::response(['unexpected_request' => $path], 500),
            };
        });

        OwnerAccess::query()->create([
            'user_id' => '575c8054-6646-443c-bf62-07945019a32f',
            'full_name' => 'Owner Example',
            'stays_owner_id' => 'owner-1',
            'status' => 'approved',
        ]);

        $this->withToken('valid-access-token')
            ->getJson('/api/owner/accounting/entries/ledger-1/details?listingId=OH01J&from=2026-10-01&to=2026-10-31')
            ->assertOk()
            ->assertJsonPath('details.reservationCode', 'QI03J')
            ->assertJsonPath('details.fees.0.label', 'Taxa de Limpeza')
            ->assertJsonPath('details.fees.0.amount', 80)
            ->assertJsonPath('details.fees.1.label', 'Taxa do parceiro: API booking.com')
            ->assertJsonPath('details.fees.1.amount', 14.25)
            ->assertJsonPath('details.fees.2.label', 'Comissão do administrador')
            ->assertJsonPath('details.fees.2.amount', 0.15)
            ->assertJsonPath('details.payout', 0.6)
            ->assertJsonPath('details.ledgerEntry.amount', 0.6);

        Http::assertSent(fn (ClientRequest $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/booking/reservations-export')
            && $request->data() === [
                'from' => '2026-10-27',
                'to' => '2026-10-30',
                'dateType' => 'included',
                'listingId' => ['OH01J'],
            ]
        );
    }
}
