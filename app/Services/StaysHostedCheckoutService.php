<?php

namespace App\Services;

class StaysHostedCheckoutService
{
    public function __construct(private readonly StaysExternalApiClient $stays) {}

    /** @return array{ready: bool, code: string|null, message: string} */
    public function readiness(): array
    {
        if (! config('services.stays.hosted_checkout_enabled', false)) {
            return [
                'ready' => false,
                'code' => 'checkout_disabled',
                'message' => 'O checkout da Stays ainda não está habilitado neste ambiente.',
            ];
        }

        if (! $this->stays->isConfigured()) {
            return [
                'ready' => false,
                'code' => 'stays_unavailable',
                'message' => 'O checkout da Stays está indisponível no momento.',
            ];
        }

        return [
            'ready' => true,
            'code' => null,
            'message' => 'O checkout hospedado da Stays está disponível.',
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{status: int, body: array<string, mixed>}
     */
    public function start(array $input): array
    {
        $readiness = $this->readiness();
        if (! $readiness['ready']) {
            return $this->failure(503, (string) $readiness['code'], $readiness['message']);
        }

        $listingId = (string) $input['listingId'];
        $listing = $this->stays->get('/content/listings/'.rawurlencode($listingId));
        if (! is_array($listing)) {
            return $this->failure(503, 'listing_unavailable', 'Não foi possível validar este imóvel na Stays.');
        }

        $identifiers = array_values(array_filter([
            $listing['id'] ?? null,
            $listing['code'] ?? null,
            $listing['_id'] ?? null,
        ], 'is_string'));
        if (! in_array($listingId, $identifiers, true)) {
            return $this->failure(404, 'listing_not_found', 'Imóvel não encontrado na Stays.');
        }
        if ((int) $input['guests'] > (int) ($listing['_i_maxGuests'] ?? 0)) {
            return $this->failure(422, 'invalid_guest_count', 'A quantidade de hóspedes excede a capacidade do imóvel.');
        }

        $availability = $this->stays->post('/booking/search-listings', [
            'from' => $input['from'],
            'to' => $input['to'],
            'guests' => $input['guests'],
            'listingId' => $listingId,
            'limit' => 100,
            'skip' => 0,
        ]);
        if (! is_array($availability) || ! array_is_list($availability)) {
            return $this->failure(503, 'availability_unavailable', 'Não foi possível confirmar a disponibilidade na Stays.');
        }

        $available = collect($availability)->contains(fn (mixed $item): bool => is_array($item)
            && count(array_intersect($identifiers, array_filter([
                $item['id'] ?? null,
                $item['code'] ?? null,
                $item['_id'] ?? null,
                $item['_idlisting'] ?? null,
            ], 'is_string'))) > 0);
        if (! $available) {
            return $this->failure(409, 'dates_unavailable', 'Este imóvel não está disponível nas datas escolhidas.');
        }

        $quoteResponse = $this->stays->post('/booking/calculate-price', [
            'from' => $input['from'],
            'to' => $input['to'],
            'listingIds' => [$listingId],
            'guests' => $input['guests'],
        ]);
        $quote = is_array($quoteResponse) && array_is_list($quoteResponse)
            ? collect($quoteResponse)->first(fn (mixed $item): bool => is_array($item)
                && in_array((string) ($item['_idlisting'] ?? $item['listingId'] ?? ''), $identifiers, true))
            : $quoteResponse;
        if (! is_array($quote) || (! array_is_list($quoteResponse ?? [])
            && isset($quote['_idlisting']) && ! in_array((string) $quote['_idlisting'], $identifiers, true))) {
            return $this->failure(503, 'quote_unavailable', 'Não foi possível confirmar o preço na Stays.');
        }

        $price = is_array($quote['bookingPrice'] ?? null) ? $quote['bookingPrice'] : $quote;
        $total = $price['_mctotal']['BRL'] ?? null;
        $feesIncluded = $quote['feesIncluded'] ?? $price['feesIncluded'] ?? null;
        $fees = $price['fees'] ?? $quote['fees'] ?? null;
        if (! is_numeric($total) || ! is_finite((float) $total) || (float) $total <= 0
            || ! is_bool($feesIncluded) || (! $feesIncluded && (! is_array($fees) || ! array_is_list($fees)))) {
            return $this->failure(503, 'quote_unavailable', 'A cotação da Stays está incompleta.');
        }

        $total = (float) $total;
        foreach ($fees ?? [] as $fee) {
            $amount = is_array($fee) ? ($fee['_mcval']['BRL'] ?? null) : null;
            if (! is_numeric($amount) || ! is_finite((float) $amount) || (float) $amount < 0) {
                return $this->failure(503, 'quote_unavailable', 'A cotação da Stays contém taxas inválidas.');
            }
            if (! $feesIncluded) {
                $total += (float) $amount;
            }
        }
        if (MoneyAmount::toCents($input['quoteTotal']) !== MoneyAmount::toCents($total)) {
            return $this->failure(409, 'quote_changed', 'O preço mudou. Confira o novo total antes de continuar.');
        }

        $names = preg_split('/\s+/u', trim((string) $input['guest']['fullName'])) ?: [];
        $result = $this->stays->post('/book-request', [
            'from' => $input['from'],
            'to' => $input['to'],
            'aptid' => $listingId,
            'persons' => $input['guests'],
            'client' => [
                'email' => $input['guest']['email'],
                'fName' => array_shift($names) ?? '',
                'lName' => implode(' ', $names),
            ],
        ]);
        $url = $result['redirectUrl'] ?? null;
        $parts = is_string($url) ? parse_url($url) : false;
        $host = is_array($parts) ? strtolower((string) ($parts['host'] ?? '')) : '';
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass'])
            || ! $this->isAllowedCheckoutHost($host)) {
            return $this->failure(502, 'stays_checkout_failed', 'A Stays não retornou um link seguro para o checkout.');
        }

        return ['status' => 200, 'body' => ['success' => true, 'checkoutUrl' => $url]];
    }

    private function isAllowedCheckoutHost(string $host): bool
    {
        if (preg_match('/(^|\.)stays\.(net|com\.br)$/', $host) === 1) {
            return true;
        }

        $configuredHosts = config('services.stays.hosted_checkout_allowed_hosts', []);

        return is_array($configuredHosts) && in_array($host, $configuredHosts, true);
    }

    /** @return array{status: int, body: array<string, mixed>} */
    private function failure(int $status, string $code, string $message): array
    {
        return ['status' => $status, 'body' => ['success' => false, 'code' => $code, 'message' => $message]];
    }
}
