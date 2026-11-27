<?php

namespace App\Services;

use App\Models\PartnerCheckoutOrder;
use App\Rules\ValidCpf;
use App\Services\Payments\CieloCardPricing;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class PartnerCheckoutOrderFactory
{
    public function __construct(private readonly ImobSysSearchClient $offers, private readonly CieloCardPricing $pricing) {}

    public function create(array $input, string $submissionKey): PartnerCheckoutOrder
    {
        if (! app()->environment(['local', 'testing']) || config('services.cielo.direct_environment') !== 'sandbox' || ! config('services.partner_checkout_sandbox.enabled')) {
            throw new RuntimeException('Checkout do parceiro indisponível.');
        }
        if (! preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/iD', $submissionKey) || ! is_string(config('app.key')) || config('app.key') === '') {
            throw new RuntimeException('Identificador de pedido inválido.');
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
        $name = trim($customer['fullName']);
        if (mb_strlen($name) < 2 || mb_strlen($name) > 150 || preg_match('/[\x00-\x1f\x7f<>]/u', $name) !== 0 || ! ValidCpf::isValid($customer['cpf'])
            || ! preg_match('/\Aimobsys-crcn-[1-9]\d{0,8}-[1-9]\d{0,11}\z/D', $propertyId)
            || ! is_int($input['acceptedBaseCents'] ?? null) || $input['acceptedBaseCents'] < 1 || $input['acceptedBaseCents'] > 100000000) {
            throw new RuntimeException('Dados do titular inválidos.');
        }
        $start = \DateTimeImmutable::createFromFormat('!Y-m-d', $from);
        $end = \DateTimeImmutable::createFromFormat('!Y-m-d', $to);
        if (! $start || ! $end || $start->format('Y-m-d') !== $from || $end->format('Y-m-d') !== $to || $start < new \DateTimeImmutable('today') || $start->diff($end)->days > 60) {
            throw new RuntimeException('Período inválido.');
        }
        $keyHash = hash('sha256', strtolower($submissionKey));
        $fingerprint = hash_hmac('sha256', json_encode([$propertyId, $from, $to, $guests, $method, $installments, $input['acceptedBaseCents'] ?? null, trim($customer['fullName']), $customer['cpf'], $customer['phone']], JSON_THROW_ON_ERROR), config('app.key'));
        $existing = PartnerCheckoutOrder::query()->where('submission_key_hash', $keyHash)->first();
        if ($existing) {
            if (! hash_equals((string) $existing->submission_fingerprint, $fingerprint)) {
                throw new RuntimeException('Identificador já usado para outro pedido.');
            }

            return $existing;
        }
        $offers = $this->offers->offers($from, $to, $guests, '', $propertyId);
        if (! is_array($offers) || count($offers) !== 1 || ! is_int($offers[0]['totalCents'] ?? null) || $offers[0]['totalCents'] < 1 || ($input['acceptedBaseCents'] ?? null) !== $offers[0]['totalCents']) {
            throw new RuntimeException('Cotação indisponível ou alterada.');
        }
        $base = $offers[0]['totalCents'];
        $amount = $method === 'pix' ? $base : $this->pricing->calculate(number_format($base / 100, 2, '.', ''), is_int($installments) ? $installments : 0)['totalCents'];

        try {
            return DB::transaction(fn (): PartnerCheckoutOrder => PartnerCheckoutOrder::create(['submission_key_hash' => $keyHash, 'submission_fingerprint' => $fingerprint, 'public_reference' => Str::random(40), 'supplier_property_id' => $propertyId, 'check_in' => $from, 'check_out' => $to, 'guests' => $guests, 'base_cents' => $base, 'payment_cents' => $amount, 'currency' => 'BRL', 'status' => 'quoted', 'merchant_order_id' => Str::random(25), 'payment_method' => $method, 'installments' => $method === 'card' ? $installments : null, 'reservation_idempotency_key' => Str::random(48), 'encrypted_customer' => ['fullName' => trim($customer['fullName']), 'cpf' => $customer['cpf'], 'phone' => $customer['phone']]]));
        } catch (QueryException $exception) {
            $existing = PartnerCheckoutOrder::query()->where('submission_key_hash', $keyHash)->first();
            if ($existing && hash_equals((string) $existing->submission_fingerprint, $fingerprint)) {
                return $existing;
            }
            throw $exception;
        }
    }
}
