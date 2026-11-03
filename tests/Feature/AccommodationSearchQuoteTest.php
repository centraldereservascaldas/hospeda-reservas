<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccommodationSearchQuoteTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'test-client',
            'services.stays.client_secret' => 'test-secret',
        ]);
    }

    public function test_returns_confirmed_totals_and_requests_only_bookable_stays(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([
            ['id' => 'quoted', '_i_maxGuests' => 4, 'bookingPrice' => $this->price()],
        ])]);

        $this->postJson('/api/search', $this->search())
            ->assertOk()->assertJsonPath('data.0.calculatedPrice.totalAmount', 750)
            ->assertJsonPath('unquotedCount', 0)->assertJsonPath('pagination.nextSkip', 1);

        Http::assertSent(fn (Request $request): bool => $request['isBookable'] === true && $request['guests'] === 2);
        Http::assertSentCount(1);
    }

    public function test_completes_missing_quotes_in_one_batch_and_matches_long_listing_identifiers(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([
                ['id' => 'one', '_id' => 'long-one'], ['id' => 'two', '_id' => 'long-two'],
            ]),
            'https://stays.test/external/v1/booking/calculate-price' => Http::response([
                ['_idlisting' => 'long-two', ...$this->search(), ...$this->price(800)],
                ['_idlisting' => 'long-one', ...$this->search(), ...$this->price()],
            ]),
        ]);

        $this->postJson('/api/search', $this->search())
            ->assertOk()->assertJsonPath('data.0.id', 'one')->assertJsonPath('data.0.calculatedPrice.totalAmount', 750)
            ->assertJsonPath('data.1.id', 'two')->assertJsonPath('data.1.calculatedPrice.totalAmount', 800)
            ->assertJsonPath('unquotedCount', 0);

        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/calculate-price')
            && $request['listingIds'] === ['one', 'two'] && $request['from'] === '2027-01-10');
        Http::assertSentCount(2);
    }

    public function test_preserves_quoted_results_and_raw_pagination_when_remaining_prices_fail(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([
                ['id' => 'quoted', 'bookingPrice' => $this->price()], ['id' => 'pending'],
            ]),
            'https://stays.test/external/v1/booking/calculate-price' => Http::response(['error' => 'private upstream message'], 503),
        ]);

        $this->postJson('/api/search', [...$this->search(), 'limit' => 2, 'skip' => 20])
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', 'quoted')
            ->assertJsonPath('unquotedCount', 1)->assertJsonPath('pagination.receivedCount', 2)
            ->assertJsonPath('pagination.nextSkip', 22)->assertJsonPath('pagination.hasMore', true)
            ->assertDontSee('private upstream message');

        Http::assertSentCount(2);
    }

    #[DataProvider('invalidQuotes')]
    public function test_does_not_confirm_a_missing_or_invalid_quote(array $price): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://stays.test/external/v1/booking/search-listings' => Http::response([['id' => 'pending']]),
            'https://stays.test/external/v1/booking/calculate-price' => Http::response([
                ['_idlisting' => 'pending', ...$price],
            ]),
        ]);

        $this->postJson('/api/search', $this->search())->assertOk()
            ->assertJsonCount(0, 'data')->assertJsonPath('unquotedCount', 1);

        Http::assertSentCount(2);
    }

    public static function invalidQuotes(): array
    {
        $valid = ['_mctotal' => ['BRL' => 750], 'feesIncluded' => true, 'fees' => []];

        return [
            'missing price' => [[]],
            'foreign currency only' => [[...$valid, '_mctotal' => ['USD' => 750]]],
            'unknown fees' => [[...$valid, 'feesIncluded' => null]],
            'negative fee' => [[...$valid, 'fees' => [['_mcval' => ['BRL' => -10]]]]],
            'no fees when excluded' => [['_mctotal' => ['BRL' => 750], 'feesIncluded' => false]],
            'wrong arrival' => [[...$valid, 'from' => '2027-01-11']],
            'wrong departure' => [[...$valid, 'to' => '2027-01-14']],
            'wrong occupancy' => [[...$valid, 'guests' => 4]],
            'wrong listing' => [[...$valid, '_idlisting' => 'another']],
        ];
    }

    public function test_adds_excluded_fees_once_and_classifies_cleaning_by_name(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([
            ['id' => 'quoted', 'bookingPrice' => [
                '_mctotal' => ['BRL' => 600], 'feesIncluded' => false,
                'fees' => [
                    ['internalName' => 'service', '_mcval' => ['BRL' => 25]],
                    ['_mstitle' => ['pt_BR' => 'Limpeza'], '_mcval' => ['BRL' => 100]],
                ],
            ]],
        ])]);

        $this->postJson('/api/search', $this->search())->assertOk()
            ->assertJsonPath('data.0.calculatedPrice.totalAmount', 725)
            ->assertJsonPath('data.0.calculatedPrice.cleaningFee', 100)
            ->assertJsonPath('data.0.calculatedPrice.serviceFee', 25);

        Http::assertSentCount(1);
    }

    public function test_returns_422_for_incomplete_dates_without_querying_stays(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);

        $this->postJson('/api/search', ['from' => '2027-01-10'])->assertUnprocessable()
            ->assertJsonPath('errors.to.0', 'Informe entrada e saída para pesquisar disponibilidade.');

        Http::assertNothingSent();
    }

    public function test_returns_503_for_malformed_availability_instead_of_a_false_empty_result(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response(['error' => 'not a listing array'])]);

        $this->postJson('/api/search', $this->search())->assertServiceUnavailable()
            ->assertJsonPath('code', 'availability_unavailable');

        Http::assertSentCount(1);
    }

    public function test_does_not_offer_a_non_bookable_or_under_capacity_listing(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([
            ['id' => 'short-stay', 'isBookable' => false, 'bookingPrice' => $this->price()],
            ['id' => 'small', '_i_maxGuests' => 1, 'bookingPrice' => $this->price()],
        ])]);

        $this->postJson('/api/search', $this->search())->assertOk()
            ->assertJsonCount(0, 'data')->assertJsonPath('unquotedCount', 0)
            ->assertJsonPath('pagination.receivedCount', 2);

        Http::assertSentCount(1);
    }

    public function test_does_not_add_included_fees_again(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([
            ['id' => 'quoted', 'bookingPrice' => [
                ...$this->price(), 'fees' => [['internalName' => 'cleaning', '_mcval' => ['BRL' => 150]]],
            ]],
        ])]);

        $this->postJson('/api/search', $this->search())->assertOk()
            ->assertJsonPath('data.0.calculatedPrice.totalAmount', 750)
            ->assertJsonPath('data.0.calculatedPrice.basePrice', 600)
            ->assertJsonPath('data.0.calculatedPrice.cleaningFee', 150);

        Http::assertSentCount(1);
    }

    public function test_preserves_the_invalid_date_range_error_contract_without_querying_stays(): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://stays.test/external/v1/booking/search-listings' => Http::response([])]);

        $this->postJson('/api/search', ['from' => '2027-01-13', 'to' => '2027-01-10'])
            ->assertUnprocessable()->assertJsonPath('code', 'invalid_search_dates')
            ->assertJsonPath('message', 'Informe um período válido.');

        Http::assertNothingSent();
    }

    /** @return array{from: string, to: string, guests: int} */
    private function search(): array
    {
        return ['from' => '2027-01-10', 'to' => '2027-01-13', 'guests' => 2];
    }

    /** @return array<string, mixed> */
    private function price(int $total = 750): array
    {
        return ['_mctotal' => ['BRL' => $total], 'feesIncluded' => true, 'fees' => []];
    }
}
