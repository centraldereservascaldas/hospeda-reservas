<?php

namespace Tests\Feature;

use App\Services\ImobSysSearchClient;
use App\Services\PartnerCheckoutOrderFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class PartnerCheckoutOrderFactoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_order_uses_supplier_quote_and_encrypts_customer(): void
    {
        config(['services.cielo.direct_environment' => 'sandbox', 'services.partner_checkout_sandbox.enabled' => true]);
        $input = ['propertyId' => 'imobsys-crcn-2-663', 'from' => now()->addDays(90)->toDateString(), 'to' => now()->addDays(92)->toDateString(), 'guests' => 2, 'method' => 'pix', 'acceptedBaseCents' => 52300, 'customer' => ['fullName' => 'Pessoa Teste', 'cpf' => '12345678901', 'phone' => '64999999999']];
        $this->mock(ImobSysSearchClient::class)->shouldReceive('offers')->twice()->andReturn([['totalCents' => 52300]]);
        $factory = app(PartnerCheckoutOrderFactory::class);
        $order = $factory->create($input);
        $this->assertSame(52300, (int) $order->payment_cents);
        $this->assertSame('Pessoa Teste', $order->fresh()->encrypted_customer['fullName']);
        $this->assertStringNotContainsString('12345678901', DB::table('partner_checkout_orders')->where('id', $order->id)->value('encrypted_customer'));
        try {
            $factory->create([...$input, 'acceptedBaseCents' => 52000]);
            $this->fail('A changed quote must be refused.');
        } catch (RuntimeException) {
            $this->assertDatabaseCount('partner_checkout_orders', 1);
        }
    }
}
