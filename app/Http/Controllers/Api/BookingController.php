<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Services\GuestStaysSyncService;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
        private readonly GuestStaysSyncService $guestSync,
    ) {}

    public function price(Request $request): JsonResponse
    {
        $input = $request->validate([
            'listingIds' => ['nullable', 'array'], 'listingIds.*' => ['string', 'max:100'], 'listingId' => ['nullable', 'string', 'max:100'],
            'from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'guests' => ['required', 'integer', 'min:1', 'max:50'], 'promocode' => ['nullable', 'string', 'max:50'],
        ]);
        $id = $input['listingIds'][0] ?? $input['listingId'] ?? null;
        if (! $id) {
            return response()->json(['success' => false, 'code' => 'invalid_quote_request', 'message' => 'Informe imóvel e datas válidas para cotar.'], 400);
        }
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $property = collect($catalog)->first(fn (array $item): bool => in_array($id, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));
        if (! $property) {
            $listing = $this->stays->get('/content/listings/'.rawurlencode($id));
            if ($listing) {
                $property = ['id' => $id, 'staysListingId' => $id, 'pricePerNight' => (float) ($listing['dailyRate'] ?? $listing['price'] ?? 0), 'cleaningFee' => (float) ($listing['cleaningFee'] ?? 0), 'serviceFeeRate' => .1, 'maxGuests' => (int) ($listing['_i_maxGuests'] ?? 1)];
            }
        }
        if (! $property) {
            return response()->json(['success' => false, 'message' => 'Acomodação não encontrada para cálculo de preço.'], 404);
        }
        if ($input['guests'] > (int) ($property['maxGuests'] ?? 1)) {
            return response()->json(['success' => false, 'code' => 'invalid_guest_count', 'message' => 'Quantidade de hóspedes inválida para esta acomodação.'], 400);
        }
        $staysId = $property['staysListingId'] ?? $property['id'];
        $quoteList = $this->stays->post('/booking/calculate-price', array_filter([
            'from' => $input['from'], 'to' => $input['to'], 'listingIds' => [$staysId], 'guests' => $input['guests'], 'promocode' => $input['promocode'] ?? null,
        ], fn ($value): bool => $value !== null));
        $quote = is_array($quoteList) && array_is_list($quoteList) ? (collect($quoteList)->firstWhere('_idlisting', $staysId) ?? $quoteList[0] ?? null) : $quoteList;
        if (is_array($quote)) {
            $nights = max(1, now()->parse($input['from'])->diffInDays(now()->parse($input['to'])));
            $price = is_array($quote['bookingPrice'] ?? null) ? $quote['bookingPrice'] : $quote;
            $currency = (string) ($price['mainCurrency'] ?? $quote['currency'] ?? 'BRL');
            $total = (float) ($quote['total'] ?? $price['_mctotal'][$currency] ?? $price['_mctotal']['BRL'] ?? 0);
            $baseTotal = (float) ($quote['subtotal'] ?? $quote['baseTotal'] ?? $total);
            $fees = is_array($price['fees'] ?? null) ? $price['fees'] : (is_array($quote['fees'] ?? null) ? $quote['fees'] : []);
            $cleaning = 0.0;
            foreach ($fees as $fee) {
                $label = mb_strtolower(($fee['internalName'] ?? '').' '.($fee['_mstitle']['pt_BR'] ?? ''));
                if (str_contains($label, 'limpez') || str_contains($label, 'clean')) {
                    $cleaning += (float) ($fee['_mcval'][$currency] ?? $fee['_mcval']['BRL'] ?? 0);
                }
            }
            $daily = (float) ($quote['dailyRate'] ?? ($baseTotal / $nights));
            $service = (float) ($quote['serviceFee'] ?? max(0, $total - $baseTotal));

            return response()->json(['success' => true, 'listingId' => $property['id'], 'staysListingId' => $staysId, 'nights' => $nights, 'dailyRate' => $daily, 'baseTotal' => $baseTotal, 'cleaningFee' => $cleaning, 'serviceFee' => $service, 'discount' => (float) ($quote['discount'] ?? 0), 'total' => $total, 'currency' => $currency, 'source' => 'stays-live', 'feesIncluded' => $quote['feesIncluded'] ?? $price['feesIncluded'] ?? true, 'fees' => $fees, 'cleaningIncluded' => $quote['cleaningIncluded'] ?? false, 'breakdown' => ['dailyRateText' => 'R$ '.number_format($daily, 2, ',', '.').' x '.$nights.' noites', 'cleaningFeeText' => 'Taxa de limpeza', 'serviceFeeText' => 'Outras taxas incluídas na diária', 'totalText' => 'R$ '.number_format($total, 2, ',', '.')]]);
        }
        if ($this->stays->isConfigured()) {
            return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'Não foi possível obter uma cotação atual da Stays. Tente novamente.'], 503);
        }

        $nights = max(1, now()->parse($input['from'])->diffInDays(now()->parse($input['to'])));
        $daily = (float) ($property['pricePerNight'] ?? 0);
        $base = $daily * $nights;
        $cleaning = (float) ($property['cleaningFee'] ?? 0);
        $service = (int) round($base * (float) ($property['serviceFeeRate'] ?? 0));
        $discount = strtoupper($input['promocode'] ?? '') === 'CALDAS10' ? (int) round($base * .1) : 0;
        $total = $base + $cleaning + $service - $discount;

        return response()->json(['success' => true, 'listingId' => $property['id'], 'staysListingId' => $staysId, 'nights' => $nights, 'dailyRate' => $daily, 'baseTotal' => $base, 'cleaningFee' => $cleaning, 'serviceFee' => $service, 'discount' => $discount, 'total' => $total, 'currency' => 'BRL', 'source' => 'local-fallback', 'feesIncluded' => false, 'fees' => [], 'cleaningIncluded' => false, 'breakdown' => ['dailyRateText' => 'R$ '.number_format($daily, 2, ',', '.').' x '.$nights.' noites', 'cleaningFeeText' => 'Taxa de limpeza (higienização e rouparia)', 'serviceFeeText' => 'Taxa de serviço Central de Reservas', 'totalText' => 'R$ '.number_format($total, 2, ',', '.')]]);
    }

    public function staysPrice(Request $request): JsonResponse
    {
        $input = $request->validate(['listingIds' => ['nullable', 'array'], 'listingIds.*' => ['string'], 'listingId' => ['nullable', 'string'], 'from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d', 'after:from'], 'guests' => ['required', 'integer', 'min:1', 'max:50']]);
        $result = $this->stays->post('/booking/calculate-price', ['listingIds' => $input['listingIds'] ?? [$input['listingId'] ?? ''], 'from' => $input['from'], 'to' => $input['to'], 'guests' => $input['guests']]);
        if (! is_array($result)) {
            return response()->json(['error' => 'Price calculation unavailable'], 503);
        }

        return response()->json($result);
    }

    public function staysStatus(): JsonResponse
    {
        $count = count(json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR));
        if (! $this->stays->isConfigured()) {
            return response()->json(['connected' => false, 'hasCredentials' => false, 'totalProperties' => $count, 'message' => 'Credenciais Stays não configuradas no servidor.'], 503);
        }
        $listings = $this->stays->get('/content/listings', ['limit' => 1, 'skip' => 0, 'status' => 'active']);
        if (! is_array($listings)) {
            return response()->json(['connected' => false, 'hasCredentials' => true, 'totalProperties' => $count, 'message' => 'Falha ao autenticar ou consultar a API Stays.'], 503);
        }

        return response()->json(['connected' => true, 'hasCredentials' => true, 'totalProperties' => $count, 'environment' => app()->environment()]);
    }

    public function checkout(Request $request): JsonResponse
    {
        $guest = $request->attributes->get('verified_guest');
        $input = $request->validate([
            'listingId' => ['nullable', 'string', 'max:100'], 'listingIds' => ['nullable', 'array'], 'listingIds.*' => ['string', 'max:100'],
            'from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d', 'after:from'],
            'guests' => ['required'], 'quoteTotal' => ['required', 'numeric', 'gt:0'],
        ]);
        $id = $input['listingId'] ?? $input['listingIds'][0] ?? null;
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $property = collect($catalog)->first(fn (array $item): bool => in_array($id, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));
        if (! $property || ! $guest instanceof VerifiedGuest) {
            return response()->json(['success' => false, 'code' => 'invalid_checkout_request', 'message' => 'Imóvel, datas ou quantidade de hóspedes inválidos.'], 400);
        }
        $guests = is_array($input['guests']) ? $input['guests'] : ['adults' => $input['guests']];
        $adults = max(0, (int) ($guests['adults'] ?? 0));
        $children = max(0, (int) ($guests['children'] ?? 0));
        $persons = $adults + $children;
        $nights = max(1, (int) now()->parse($input['from'])->diffInDays(now()->parse($input['to'])));
        if ($persons < 1 || $persons > (int) $property['maxGuests']) {
            return response()->json(['success' => false, 'code' => 'invalid_checkout_request', 'message' => 'Imóvel, datas ou quantidade de hóspedes inválidos.'], 400);
        }
        if (! $this->stays->isConfigured()) {
            return response()->json(['success' => false, 'code' => 'stays_not_configured', 'message' => 'Checkout seguro indisponível no momento.'], 503);
        }
        $listingId = $property['staysListingId'] ?? $property['id'];
        $availability = $this->stays->post('/booking/search-listings', ['from' => $input['from'], 'to' => $input['to'], 'guests' => $persons, 'listingId' => $listingId, 'limit' => 100, 'skip' => 0]);
        if (! is_array($availability)) {
            return response()->json(['success' => false, 'code' => 'availability_unavailable', 'message' => 'Não foi possível confirmar a disponibilidade atual. Nenhuma reserva foi iniciada. Tente novamente.'], 503);
        }
        $available = collect($availability)->contains(fn (array $listing): bool => in_array($listingId, [(string) ($listing['id'] ?? ''), (string) ($listing['_id'] ?? ''), (string) ($listing['code'] ?? '')], true));
        if (! $available) {
            return response()->json(['success' => false, 'code' => 'dates_unavailable', 'message' => 'Este apartamento não está mais disponível para as datas selecionadas. Escolha outro período.'], 409);
        }
        $quoteResponse = $this->stays->post('/booking/calculate-price', ['from' => $input['from'], 'to' => $input['to'], 'listingIds' => [$listingId], 'guests' => $persons]);
        $quote = is_array($quoteResponse) && array_is_list($quoteResponse)
            ? (collect($quoteResponse)->firstWhere('_idlisting', $listingId) ?? $quoteResponse[0] ?? null)
            : $quoteResponse;
        if (! is_array($quote)) {
            return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'Não foi possível revalidar preço e disponibilidade. Tente novamente.'], 503);
        }
        $price = is_array($quote['bookingPrice'] ?? null) ? $quote['bookingPrice'] : $quote;
        $currency = (string) ($price['mainCurrency'] ?? $quote['currency'] ?? 'BRL');
        $rawTotal = $quote['total'] ?? $price['_mctotal'][$currency] ?? $price['_mctotal']['BRL'] ?? null;
        $feesIncluded = $quote['feesIncluded'] ?? $price['feesIncluded'] ?? null;
        if (! is_numeric($rawTotal) || (float) $rawTotal <= 0 || ! is_bool($feesIncluded)) {
            return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'Não foi possível revalidar preço e disponibilidade. Tente novamente.'], 503);
        }
        $fees = is_array($price['fees'] ?? null) ? $price['fees'] : (is_array($quote['fees'] ?? null) ? $quote['fees'] : []);
        $fees = array_values(array_filter($fees, fn (mixed $fee): bool => is_array($fee)));
        $feeTotal = collect($fees)->sum(fn (array $fee): float => $this->feeAmount($fee, $currency));
        $cleaningFee = collect($fees)
            ->filter(fn (array $fee): bool => $this->isCleaningFee($fee))
            ->sum(fn (array $fee): float => $this->feeAmount($fee, $currency));
        $total = (float) $rawTotal + ($feesIncluded ? 0 : $feeTotal);
        if ($total <= 0) {
            return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'Não foi possível revalidar preço e disponibilidade. Tente novamente.'], 503);
        }
        $baseTotal = (float) ($quote['subtotal'] ?? $quote['baseTotal'] ?? ($feesIncluded ? $total : $total - $cleaningFee));
        $daily = (float) ($quote['dailyRate'] ?? ($baseTotal / $nights));
        $currentQuote = ['listingId' => $property['id'], 'staysListingId' => $listingId, 'nights' => $nights, 'dailyRate' => $daily, 'baseTotal' => $baseTotal, 'cleaningFee' => (float) ($quote['cleaningFee'] ?? $cleaningFee), 'serviceFee' => (float) ($quote['serviceFee'] ?? max(0, $total - $baseTotal)), 'discount' => (float) ($quote['discount'] ?? 0), 'total' => $total, 'currency' => $currency, 'source' => 'stays-live'];
        if (abs(round((float) $input['quoteTotal'] * 100) - round($total * 100)) > 0) {
            return response()->json(['success' => false, 'code' => 'quote_changed', 'message' => 'O preço ou a disponibilidade mudou. Revise a cotação atualizada antes de continuar.', 'quote' => $currentQuote], 409);
        }
        if (! $this->guestSync->sync($guest)) {
            return response()->json(['success' => false, 'code' => 'stays_client_sync_failed', 'message' => 'Não foi possível confirmar seu cadastro com o sistema de reservas. Nenhuma reserva foi iniciada. Tente novamente.'], 503);
        }
        $nameParts = preg_split('/\s+/', trim($guest->fullName), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $bookRequest = $this->stays->post('/book-request', ['from' => $input['from'], 'to' => $input['to'], 'aptid' => $listingId, 'persons' => $persons, 'client' => ['email' => $guest->email, 'fName' => $nameParts[0] ?? '', 'lName' => implode(' ', array_slice($nameParts, 1))]]);
        $redirectUrl = (string) ($bookRequest['redirectUrl'] ?? '');
        $host = strtolower((string) parse_url($redirectUrl, PHP_URL_HOST));
        if (! str_starts_with($redirectUrl, 'https://') || ! preg_match('/(^|\.)stays\.(net|com\.br)$/', $host)) {
            return response()->json(['success' => false, 'code' => 'stays_checkout_failed', 'message' => 'Não foi possível abrir o checkout. Tente novamente.'], 502);
        }

        return response()->json(['success' => true, 'status' => 'checkout_pending', 'checkoutUrl' => $redirectUrl, 'redirectUrl' => $redirectUrl, 'quote' => $currentQuote]);
    }

    private function feeAmount(array $fee, string $currency): float
    {
        $amounts = is_array($fee['_mcval'] ?? null) ? $fee['_mcval'] : [];

        return (float) ($amounts[$currency] ?? $amounts['BRL'] ?? 0);
    }

    private function isCleaningFee(array $fee): bool
    {
        $title = is_array($fee['_mstitle'] ?? null) ? ($fee['_mstitle']['pt_BR'] ?? '') : '';

        return preg_match('/clean|limpez/i', (string) ($fee['internalName'] ?? '').' '.$title) === 1;
    }
}
