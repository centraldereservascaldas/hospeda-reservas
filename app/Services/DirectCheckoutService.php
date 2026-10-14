<?php

namespace App\Services;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Requests\StoreCheckoutRequest;
use App\Models\DirectBookingOrder;
use App\Services\Payments\DirectCheckoutPaymentService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DirectCheckoutService
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly DirectSaleTermsRegistry $terms,
        private readonly DirectStaysReservationService $reservations,
        private readonly DirectCheckoutPaymentService $payments,
    ) {}

    /** @return array{order: DirectBookingOrder|null, code: string|null, message: string|null, status: int, replayed: bool, success: bool, resumeReference: string|null, resumeToken: string|null} */
    public function createOrder(StoreCheckoutRequest $request): array
    {
        if (! config('direct-booking.enabled', false)) {
            return [
                'order' => null,
                'code' => 'checkout_disabled',
                'message' => 'A compra no site está em preparação. Nenhum pedido, pré-reserva ou pagamento foi iniciado.',
                'status' => 503,
                'replayed' => false,
                'success' => false,
                'resumeReference' => null,
                'resumeToken' => null,
            ];
        }

        if ($this->payments->availableMethods() === []) {
            return [
                'order' => null,
                'code' => 'payments_disabled',
                'message' => 'O pagamento no site ainda não está pronto. Nenhum pedido, pré-reserva ou pagamento foi iniciado.',
                'status' => 503,
                'replayed' => false,
                'success' => false,
                'resumeReference' => null,
                'resumeToken' => null,
            ];
        }

        $input = $request->validated();
        $idempotencyKey = $input['idempotencyKey'];
        $fingerprint = $this->requestFingerprint($input);

        $existingOrder = DirectBookingOrder::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existingOrder !== null) {
            if (! hash_equals($existingOrder->request_fingerprint, $fingerprint)) {
                return ['order' => null, 'code' => 'idempotency_key_reused', 'message' => 'Esta chave de tentativa já foi usada com dados diferentes. Inicie uma nova tentativa com outra chave.', 'status' => 409, 'replayed' => false];
            }

            return $this->continueOrder($existingOrder, replayed: true);
        }

        return $this->createOrderOnce($input, $idempotencyKey, $fingerprint);
    }

    /** @param array<string, mixed> $input
     * @return array{order: DirectBookingOrder|null, code: string|null, message: string|null, status: int, replayed: bool, success: bool, resumeReference: string|null, resumeToken: string|null}
     */
    private function createOrderOnce(array $input, string $idempotencyKey, string $fingerprint): array
    {
        $property = $this->terms->findApprovedListing($input['listingId']);
        $termsSnapshot = is_array($property) ? ($property['directSaleTermsSnapshot'] ?? null) : null;
        if ($property === null || ! is_string($property['directSaleTermsVersion'] ?? null)
            || ! hash_equals($property['directSaleTermsVersion'], $input['acceptedTermsVersion'])
            || ! is_array($termsSnapshot)
            || ! is_string($termsSnapshot['version'] ?? null)
            || ! hash_equals($property['directSaleTermsVersion'], $termsSnapshot['version'])
            || array_diff_key($termsSnapshot, ['version' => true]) === []) {
            return ['order' => null, 'code' => 'checkout_conditions_unavailable', 'message' => 'As condições aprovadas para este imóvel ainda não estão disponíveis. Nenhum pedido, reserva ou cobrança foi iniciado.', 'status' => 503, 'replayed' => false];
        }

        if (! $this->stays->isConfigured()) {
            return ['order' => null, 'code' => 'quote_unavailable', 'message' => 'Não foi possível revalidar o preço na Stays. Nenhum pedido, reserva ou cobrança foi iniciado.', 'status' => 503, 'replayed' => false];
        }

        $staysListingId = (string) ($property['staysListingId'] ?? $input['listingId']);
        $guestCount = $input['guests']['adults'] + $input['guests']['children'] + $input['guests']['infants'];
        if ($guestCount > (int) ($property['maxGuests'] ?? 0)) {
            return ['order' => null, 'code' => 'invalid_guest_count', 'message' => 'A quantidade de hóspedes excede a capacidade informada para este imóvel. Nenhum pedido, reserva ou cobrança foi iniciado.', 'status' => 422, 'replayed' => false];
        }

        $availability = $this->stays->post('/booking/search-listings', [
            'from' => $input['from'],
            'to' => $input['to'],
            'guests' => $guestCount,
            'listingId' => $staysListingId,
            'limit' => 100,
            'skip' => 0,
        ]);
        if (! is_array($availability)) {
            return ['order' => null, 'code' => 'availability_unavailable', 'message' => 'Não foi possível confirmar a disponibilidade atual na Stays. Nenhum pedido, reserva ou cobrança foi iniciado.', 'status' => 503, 'replayed' => false];
        }
        $availableListing = collect($availability)->filter(fn (mixed $listing): bool => is_array($listing))->first(fn (array $listing): bool => in_array($staysListingId, [
            (string) ($listing['id'] ?? ''),
            (string) ($listing['_idlisting'] ?? ''),
            (string) ($listing['_id'] ?? ''),
            (string) ($listing['code'] ?? ''),
        ], true));
        if (! is_array($availableListing)) {
            return ['order' => null, 'code' => 'dates_unavailable', 'message' => 'Este imóvel não está disponível para as datas selecionadas. Nenhum pedido, reserva ou cobrança foi iniciado.', 'status' => 409, 'replayed' => false];
        }

        $quoteListingIds = array_values(array_unique(array_filter([
            $staysListingId,
            $availableListing['id'] ?? null,
            $availableListing['_idlisting'] ?? null,
            $availableListing['_id'] ?? null,
            $availableListing['code'] ?? null,
        ], fn (mixed $listingId): bool => is_string($listingId) && $listingId !== '')));

        $quoteResponse = $this->stays->post('/booking/calculate-price', [
            'from' => $input['from'],
            'to' => $input['to'],
            'listingIds' => [$staysListingId],
            'guests' => $guestCount,
        ]);
        $quote = $this->extractQuote($quoteResponse, $quoteListingIds);
        if ($quote === null) {
            return ['order' => null, 'code' => 'quote_unavailable', 'message' => 'Não foi possível revalidar o preço na Stays. Nenhum pedido, reserva ou cobrança foi iniciado.', 'status' => 503, 'replayed' => false];
        }

        if (MoneyAmount::toCents($input['quoteTotal']) !== MoneyAmount::toCents($quote['total'])) {
            return ['order' => null, 'code' => 'quote_changed', 'message' => 'O preço ou a moeda mudou. Atualize a cotação e confirme novamente.', 'status' => 409, 'replayed' => false];
        }

        try {
            $order = DB::transaction(function () use ($input, $property, $termsSnapshot, $staysListingId, $quote, $idempotencyKey, $fingerprint): DirectBookingOrder {
                $order = DirectBookingOrder::create([
                    'status' => DirectBookingOrderStatus::Cotado,
                    'idempotency_key' => $idempotencyKey,
                    'public_reference' => Str::random(40),
                    'resume_token' => Str::random(64),
                    'request_fingerprint' => $fingerprint,
                    'listing_id' => (string) ($property['id'] ?? $input['listingId']),
                    'stays_listing_id' => $staysListingId,
                    'check_in' => $input['from'],
                    'check_out' => $input['to'],
                    'guests' => $input['guests'],
                    'guest_name' => $input['guest']['fullName'],
                    'guest_email' => mb_strtolower($input['guest']['email']),
                    'guest_phone' => $input['guest']['phone'],
                    'quote_total' => number_format($quote['total'], 2, '.', ''),
                    'currency' => $quote['currency'],
                    'quote_snapshot' => $quote['snapshot'],
                    'accepted_terms_version' => $input['acceptedTermsVersion'],
                    'accepted_terms_snapshot' => $termsSnapshot,
                    'terms_accepted_at' => now(),
                    'origin' => 'website',
                    'operational_events' => [[
                        'status' => DirectBookingOrderStatus::Cotado->value,
                        'at' => now()->toISOString(),
                        'source' => 'direct_checkout',
                    ]],
                ]);

                return $order;
            });
        } catch (UniqueConstraintViolationException) {
            $existingOrder = DirectBookingOrder::query()->where('idempotency_key', $idempotencyKey)->first();
            if ($existingOrder !== null && hash_equals($existingOrder->request_fingerprint, $fingerprint)) {
                return $this->continueOrder($existingOrder, replayed: true);
            }

            return ['order' => null, 'code' => 'idempotency_key_reused', 'message' => 'Esta chave de tentativa já foi usada com dados diferentes. Inicie uma nova tentativa com outra chave.', 'status' => 409, 'replayed' => false];
        }

        return $this->continueOrder($order, replayed: false);
    }

    /** @return array{order: DirectBookingOrder, code: string, message: string, status: int, replayed: bool, success: bool, resumeReference: string|null, resumeToken: string|null} */
    private function continueOrder(DirectBookingOrder $order, bool $replayed): array
    {
        $order->refresh();
        $reservation = null;
        if ($order->status === DirectBookingOrderStatus::Cotado || $order->status === DirectBookingOrderStatus::AtencaoOperacional) {
            $reservation = $this->reservations->reserve($order);
            $order->refresh();
        }
        $ready = $order->status === DirectBookingOrderStatus::PreReservado && $order->stays_reservation_id !== null;

        return [
            'order' => $order,
            'code' => $ready ? 'pre_reserved' : ($reservation['code'] ?? 'reservation_not_ready'),
            'message' => $ready
                ? 'Pré-reserva registrada. Pagamentos continuam desabilitados.'
                : ($reservation['message'] ?? 'O pedido foi registrado, mas a pré-reserva requer conferência operacional. Nenhuma cobrança foi iniciada.'),
            'status' => $ready ? 201 : 503,
            'replayed' => $replayed,
            'success' => $ready,
            'resumeReference' => $order->public_reference,
            'resumeToken' => $order->resume_token,
        ];
    }

    /** @param array<string, mixed> $input */
    private function requestFingerprint(array $input): string
    {
        unset($input['idempotencyKey']);
        $input = $this->canonicalize($input);

        return hash_hmac('sha256', json_encode($input, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
    }

    /** @param array<string|int, mixed> $value
     * @return array<string|int, mixed>
     */
    private function canonicalize(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }

        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->canonicalize($item);
            }
        }

        return $value;
    }

    /**
     * @param  array<mixed>|null  $response
     * @param  list<string>  $staysListingIds
     * @return array{total: float, currency: string, snapshot: array<string, mixed>}|null
     */
    private function extractQuote(?array $response, array $staysListingIds): ?array
    {
        if (! is_array($response)) {
            return null;
        }

        if (array_is_list($response)) {
            $quote = collect($response)->first(function (mixed $item) use ($staysListingIds): bool {
                return is_array($item)
                    && in_array((string) ($item['_idlisting'] ?? $item['listingId'] ?? ''), $staysListingIds, true);
            });
        } else {
            $responseListingId = $response['_idlisting'] ?? $response['listingId'] ?? null;
            if ($responseListingId !== null && ! in_array((string) $responseListingId, $staysListingIds, true)) {
                return null;
            }

            $quote = $response;
        }

        if (! is_array($quote)) {
            return null;
        }

        $bookingPrice = is_array($quote['bookingPrice'] ?? null) ? $quote['bookingPrice'] : $quote;
        $currency = 'BRL';
        $feesIncluded = $quote['feesIncluded'] ?? $bookingPrice['feesIncluded'] ?? null;
        if (! is_bool($feesIncluded)) {
            return null;
        }
        $total = $bookingPrice['_mctotal'][$currency] ?? null;
        if (! is_numeric($total) || ! is_finite((float) $total) || (float) $total <= 0) {
            return null;
        }
        $hasFees = array_key_exists('fees', $bookingPrice) || array_key_exists('fees', $quote);
        $fees = $bookingPrice['fees'] ?? $quote['fees'] ?? [];
        if (! is_array($fees) || ! array_is_list($fees) || (! $feesIncluded && ! $hasFees)) {
            return null;
        }

        foreach ($fees as $fee) {
            if (! is_array($fee)) {
                return null;
            }

            $amounts = is_array($fee['_mcval'] ?? null) ? $fee['_mcval'] : [];
            $amount = $amounts[$currency] ?? null;
            if (! is_numeric($amount) || ! is_finite((float) $amount) || (float) $amount < 0) {
                return null;
            }
        }

        if (! $feesIncluded) {
            foreach ($fees as $fee) {
                $amounts = is_array($fee['_mcval'] ?? null) ? $fee['_mcval'] : [];
                $total += (float) ($amounts[$currency] ?? $amounts['BRL'] ?? 0);
            }
        }
        if (! is_finite($total) || $total <= 0) {
            return null;
        }

        return ['total' => (float) $total, 'currency' => $currency, 'snapshot' => $quote];
    }
}
