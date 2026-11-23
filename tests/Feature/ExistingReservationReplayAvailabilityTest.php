<?php

namespace Tests\Feature;

use App\Models\DirectBookingOrder;
use App\Services\ExistingCheckoutRecoveryCredential;
use App\Services\LegalPageRegistry;
use App\Services\Payments\CieloEcommerceClient;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExistingReservationReplayAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_order_can_be_recovered_without_enabling_new_payment_when_checkout_becomes_unavailable(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'direct-booking.enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true,
            'direct-booking.payment_provider' => 'cielo', 'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24)]);
        $methods = ['pix'];
        $merchantId = 'test-merchant';
        $this->mock(DirectCheckoutPaymentService::class, function ($mock) use (&$methods): void {
            $mock->shouldReceive('availableMethods')->andReturnUsing(function () use (&$methods) {
                return $methods;
            });
            $mock->shouldReceive('publicKey')->andReturn(null);
            $mock->shouldReceive('provider')->andReturn('cielo');
        });
        $this->mock(CieloEcommerceClient::class)->shouldReceive('merchantId')->andReturnUsing(function () use (&$merchantId) {
            return $merchantId;
        });
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => match (true) {
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']),
            str_ends_with($request->url(), '/payments') => Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 197.50], 'partner' => ['name' => 'API booking.com']]),
        });
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $key = 'existing-replay-outage-12345';
        $issued = $this->postJson('/api/existing-reservations/ZY92K/recovery-credential')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $secret = $issued->json('credential');
        $this->assertMatchesRegularExpression('/^[a-f0-9]{144}$/D', $secret);
        $this->assertNotSame($secret, $this->postJson('/api/existing-reservations/ZY92K/recovery-credential')->json('credential'));
        $this->withHeaders(['Idempotency-Key' => 'forged-secret-key-123456', 'X-Checkout-Recovery-Secret' => str_repeat('a', 128)])->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertUnprocessable();
        $created = $this->withHeaders(['Idempotency-Key' => $key, 'X-Checkout-Recovery-Secret' => $secret])->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertCreated();
        $reference = $created->json('resume.reference');
        $token = $created->json('resume.token');
        config(['direct-booking.existing_reservation_checkout_enabled' => false]);
        $this->withHeader('X-Checkout-Recovery-Secret', $secret)->postJson('/api/existing-reservations/ZY92K/recover')
            ->assertOk()->assertJsonPath('resume.reference', $reference)->assertJsonPath('resume.token', $token)
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->withHeader('X-Checkout-Recovery-Secret', str_repeat('b', 128))->postJson('/api/existing-reservations/ZY92K/recover')->assertUnprocessable();
        $this->withHeader('X-Checkout-Recovery-Secret', $secret)->postJson('/api/existing-reservations/AB12C/recover')->assertUnprocessable();

        foreach (['global', 'feature', 'provider', 'cycle', 'methods', 'merchant_missing', 'merchant_changed'] as $scenario) {
            config(['direct-booking.enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true, 'direct-booking.payment_provider' => 'cielo', 'direct-booking.experimental_existing_cycle_settlement_enabled' => false, 'direct-booking.experimental_existing_ledger_audit_enabled' => false]);
            $methods = ['pix'];
            $merchantId = 'test-merchant';
            match ($scenario) {
                'global' => config(['direct-booking.enabled' => false]),
                'feature' => config(['direct-booking.existing_reservation_checkout_enabled' => false]),
                'provider' => config(['direct-booking.payment_provider' => 'mercadopago']),
                'cycle' => config(['direct-booking.experimental_existing_cycle_settlement_enabled' => true]),
                'methods' => $methods = [],
                'merchant_missing' => $merchantId = null,
                'merchant_changed' => $merchantId = 'other-merchant',
            };
            $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $payload)
                ->assertOk()->assertJsonPath('resume.reference', $reference)->assertJsonPath('resume.token', $token)
                ->assertJsonPath('payment.enabled', false)->assertJsonPath('payment.methods', []);
            $changed = $payload;
            $changed['guest']['email'] = 'changed@example.test';
            $this->withHeader('Idempotency-Key', $key)->postJson('/api/existing-reservations/ZY92K/checkout', $changed)->assertConflict();
            if ($scenario !== 'merchant_changed') {
                $this->withHeader('Idempotency-Key', 'new-order-outage-key-'.str_pad((string) strlen($scenario), 4, '0', STR_PAD_LEFT))
                    ->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertStatus($scenario === 'cycle' ? 409 : 503);
            }
        }
        $this->assertSame(1, DirectBookingOrder::query()->count());
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    public function test_recovery_revokes_unused_credential_and_late_order_creation_fails(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        config(['services.stays.base_url' => 'https://stays.test/external/v1', 'services.stays.client_id' => 'test', 'services.stays.client_secret' => 'test',
            'direct-booking.enabled' => true, 'direct-booking.existing_reservation_checkout_enabled' => true,
            'direct-booking.payment_provider' => 'cielo', 'direct-booking.stays_cielo_pix_provider_id' => str_repeat('f', 24)]);
        $this->mock(DirectCheckoutPaymentService::class, function ($mock): void {
            $mock->shouldReceive('availableMethods')->andReturn(['pix']);
        });
        $this->mock(CieloEcommerceClient::class)->shouldReceive('merchantId')->andReturn('test-merchant');
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => match (true) {
            str_contains($request->url(), '/finance/payment-providers/') => Http::response(['_id' => str_repeat('f', 24), 'status' => 'active', 'internalName' => 'Cielo Site Externo']),
            str_ends_with($request->url(), '/payments') => Http::response([['_idpaymentProvider' => str_repeat('f', 24), '_id' => str_repeat('a', 24), 'type' => 'credit', 'status' => 'pending', '_f_val' => 197.50, 'name' => 'Pagamento da reserva']]),
            default => Http::response(['id' => 'ZY92K', '_id' => str_repeat('c', 24), '_idclient' => str_repeat('d', 24), '_idlisting' => str_repeat('e', 24), 'type' => 'booked', 'checkInDate' => '2030-11-13', 'checkOutDate' => '2030-11-16', 'guests' => 4, 'guestsDetails' => ['adults' => 4, 'children' => 0, 'infants' => 0], 'price' => ['currency' => 'BRL', '_f_total' => 395], 'stats' => ['_f_totalPaid' => 197.50], 'partner' => ['name' => 'API booking.com']]),
        });
        $secret = $this->postJson('/api/existing-reservations/ZY92K/recovery-credential')->json('credential');
        $prunedUnusedSecret = $this->postJson('/api/existing-reservations/ZY92K/recovery-credential')->json('credential');
        $this->withHeader('X-Checkout-Recovery-Secret', $secret)->postJson('/api/existing-reservations/ZY92K/recover')->assertOk()->assertJsonPath('restart', true);
        $this->travel(8)->days();
        $this->artisan('direct-booking:prune-existing-checkout-recovery-credentials')->assertSuccessful();
        $this->withHeader('X-Checkout-Recovery-Secret', $secret)->postJson('/api/existing-reservations/ZY92K/recover')->assertOk()->assertJsonPath('restart', true);
        $this->assertDatabaseMissing('existing_checkout_recovery_credentials', ['credential_hash' => app(ExistingCheckoutRecoveryCredential::class)->hash($prunedUnusedSecret)]);
        $this->withHeader('X-Checkout-Recovery-Secret', $prunedUnusedSecret)->postJson('/api/existing-reservations/ZY92K/recover')->assertOk()->assertJsonPath('restart', true);
        $payload = ['expectedBalanceCents' => 19750, 'paymentMethod' => 'pix', 'guest' => ['fullName' => 'Hóspede Teste', 'email' => 'guest@example.test', 'phone' => '64999999999', 'cpf' => '52998224725'], 'acceptedPayment' => true, ...$this->contractAcceptance()];
        $this->withHeaders(['Idempotency-Key' => 'existing-late-order-key-12345', 'X-Checkout-Recovery-Secret' => $secret])->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertConflict()->assertJsonPath('code', 'existing_checkout_recovery_revoked');
        $this->withHeaders(['Idempotency-Key' => 'existing-pruned-late-key-12345', 'X-Checkout-Recovery-Secret' => $prunedUnusedSecret])->postJson('/api/existing-reservations/ZY92K/checkout', $payload)->assertConflict()->assertJsonPath('code', 'existing_checkout_recovery_revoked');
        $this->assertSame(0, DirectBookingOrder::query()->count());
        Http::assertNotSent(fn (Request $request) => $request->method() !== 'GET');
    }

    /** @return array{acceptedContract: array{version: string, contentHash: string}} */
    private function contractAcceptance(): array
    {
        $contract = app(LegalPageRegistry::class)->find('contrato');
        $this->assertIsArray($contract);

        return ['acceptedContract' => ['version' => $contract['version'], 'contentHash' => hash('sha256', json_encode($contract, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))]];
    }
}
