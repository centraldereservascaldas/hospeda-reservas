<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use App\Services\Payments\CieloCardPricing;
use Illuminate\Support\Str;
use RuntimeException;

class PartnerCheckoutOrderFactory
{
    public function __construct(private readonly ImobSysSearchClient $offers, private readonly CieloCardPricing $pricing) {}

    public function create(array $input): PartnerCheckoutOrder
    {
        if (! app()->environment(['local', 'testing']) || config('services.cielo.direct_environment') !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled')) {
            throw new RuntimeException('Checkout do parceiro indisponível.');
        }
        $propertyId = $input['propertyId'] ?? '';
        $from = $input['from'] ?? '';
        $to = $input['to'] ?? '';
        $guests = $input['guests'] ?? null;
        $method = $input['method'] ?? '';
        $installments = $input['installments'] ?? null;
        $customer = $input['customer'] ?? null;
        if (! is_string($propertyId) || ! preg_match('/\Aimobsys-crcn-[1-9]\d*-[1-9]\d*\z/D', $propertyId) || ! is_string($from) || ! is_string($to) || ! preg_match('/\A\d{4}-\d{2}-\d{2}\z/D', $from) || ! preg_match('/\A\d{4}-\d{2}-\d{2}\z/D', $to) || $from >= $to || ! is_int($guests) || $guests < 2 || $guests > 10 || ! in_array($method, ['pix', 'card'], true) || ! is_array($customer) || ! is_string($customer['fullName'] ?? null) || trim($customer['fullName']) === '' || ! preg_match('/\A\d{11}\z/D', (string) ($customer['cpf'] ?? '')) || ! preg_match('/\A\d{10,13}\z/D', (string) ($customer['phone'] ?? ''))) {
            throw new RuntimeException('Dados do pedido inválidos.');
        }
        $start = \DateTimeImmutable::createFromFormat('!Y-m-d', $from);
        $end = \DateTimeImmutable::createFromFormat('!Y-m-d', $to);
        if (! $start || ! $end || $start->format('Y-m-d') !== $from || $end->format('Y-m-d') !== $to || $start < new \DateTimeImmutable('today') || $start->diff($end)->days > 60) {
            throw new RuntimeException('Período inválido.');
        }
        $offers = $this->offers->offers($from, $to, $guests, '', $propertyId);
        if (! is_array($offers) || count($offers) !== 1 || ! is_int($offers[0]['totalCents'] ?? null) || $offers[0]['totalCents'] < 1 || ($input['acceptedBaseCents'] ?? null) !== $offers[0]['totalCents']) {
            throw new RuntimeException('Cotação indisponível ou alterada.');
        }
        $base = $offers[0]['totalCents'];
        $amount = $method === 'pix' ? $base : $this->pricing->calculate(number_format($base / 100, 2, '.', ''), is_int($installments) ? $installments : 0)['totalCents'];

        return PartnerCheckoutOrder::create(['public_reference' => Str::random(40), 'supplier_property_id' => $propertyId, 'check_in' => $from, 'check_out' => $to, 'guests' => $guests, 'base_cents' => $base, 'payment_cents' => $amount, 'currency' => 'BRL', 'status' => 'quoted', 'merchant_order_id' => Str::random(25), 'payment_method' => $method, 'installments' => $method === 'card' ? $installments : null, 'reservation_idempotency_key' => Str::random(48), 'encrypted_customer' => ['fullName' => trim($customer['fullName']), 'cpf' => $customer['cpf'], 'phone' => $customer['phone']]]);
    }
}
