<?php

namespace App\Services;

class ExistingReservationPaymentChannels
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    /** @return array{pix: string|null, cards: array<int, string|null>} */
    public function snapshot(): array
    {
        $cardConfig = config('direct-booking.stays_cielo_card_provider_ids', []);
        $cards = [];
        foreach (range(1, 6) as $installments) {
            $cards[$installments] = $this->validId(is_array($cardConfig) ? ($cardConfig[$installments] ?? null) : null);
        }

        return ['pix' => $this->validId(config('direct-booking.stays_cielo_pix_provider_id')), 'cards' => $cards];
    }

    /** @param list<string> $gatewayMethods
     * @return list<string>
     */
    public function availableMethods(array $gatewayMethods): array
    {
        if (config('direct-booking.experimental_existing_ledger_audit_enabled', false) !== true) {
            return [];
        }
        $snapshot = $this->snapshot();
        $cardIds = array_values($snapshot['cards']);

        return array_values(array_filter($gatewayMethods, fn (string $method): bool => match ($method) {
            'pix' => $snapshot['pix'] !== null && ! in_array($snapshot['pix'], $cardIds, true),
            'card' => false, // Stays accounting for the surcharge is not yet established.
            default => false,
        }));
    }

    /**
     * The API does not document changing a receivable's provider after creation.
     * Offer only the channel already attached to this specific receivable.
     *
     * @param  list<string>  $gatewayMethods
     * @param  list<mixed>  $payments
     * @return array{methods: list<string>, card_installments: list<int>}
     */
    public function availableForReceivable(array $gatewayMethods, array $payments, ?string $paymentId): array
    {
        $none = ['methods' => [], 'card_installments' => []];
        if ($paymentId === null) {
            return $none;
        }
        $matching = array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment) && ($payment['_id'] ?? null) === $paymentId));
        if (count($matching) !== 1 || ! is_string($matching[0]['_idpaymentProvider'] ?? null)) {
            return $none;
        }
        $provider = $matching[0]['_idpaymentProvider'];
        $snapshot = $this->snapshot();
        $configured = $this->availableMethods($gatewayMethods);
        $methods = [];
        $installments = [];
        if (in_array('pix', $configured, true) && $snapshot['pix'] === $provider
            && $this->verifiedProvider($snapshot, 'pix', null) === $provider) {
            $methods[] = 'pix';
        }
        if (in_array('card', $configured, true)) {
            foreach (range(1, 6) as $count) {
                if ($snapshot['cards'][$count] === $provider && $this->verifiedProvider($snapshot, 'card', $count) === $provider) {
                    $installments[] = $count;
                }
            }
            if ($installments !== []) {
                $methods[] = 'card';
            }
        }

        return ['methods' => $methods, 'card_installments' => $installments];
    }

    /** @param list<string> $gatewayMethods
     * @return array{methods: list<string>, card_installments: list<int>}
     */
    public function availableForNewReceivable(array $gatewayMethods): array
    {
        $snapshot = $this->snapshot();
        $configured = $this->availableMethods($gatewayMethods);
        $methods = [];
        $installments = [];
        if (in_array('pix', $configured, true) && $this->verifiedProvider($snapshot, 'pix', null) !== null) {
            $methods[] = 'pix';
        }
        if (in_array('card', $configured, true)) {
            foreach (range(1, 6) as $count) {
                if ($this->verifiedProvider($snapshot, 'card', $count) !== null) {
                    $installments[] = $count;
                }
            }
            if ($installments !== []) {
                $methods[] = 'card';
            }
        }

        return ['methods' => $methods, 'card_installments' => $installments];
    }

    /** @param array<string, mixed> $snapshot */
    public function verifiedProvider(array $snapshot, string $method, ?int $installments): ?string
    {
        $current = $this->snapshot();
        $candidate = $method === 'pix' ? ($snapshot['pix'] ?? null) : ($snapshot['cards'][$installments ?? 0] ?? null);
        $expected = $method === 'pix' ? $current['pix'] : ($current['cards'][$installments ?? 0] ?? null);
        $name = $method === 'pix' ? 'Pix API Cielo' : 'Cartão API Cielo '.$installments.'x';
        if (! in_array($method, ['pix', 'card'], true) || ($method === 'card' && ($installments === null || $installments < 1 || $installments > 6))
            || ! is_string($candidate) || ! is_string($expected) || ! hash_equals($expected, $candidate)) {
            return null;
        }
        $provider = $this->stays->get('/finance/payment-providers/'.rawurlencode($candidate));
        if (! is_array($provider) || ($provider['_id'] ?? null) !== $candidate || ($provider['status'] ?? null) !== 'active'
            || ! is_string($provider['internalName'] ?? null) || mb_strtolower(trim($provider['internalName'])) !== mb_strtolower($name)) {
            return null;
        }

        return $candidate;
    }

    private function validId(mixed $id): ?string
    {
        return is_string($id) && preg_match('/^[a-f0-9]{24}$/iD', $id) ? $id : null;
    }
}
