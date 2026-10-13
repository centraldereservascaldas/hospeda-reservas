<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCheckoutRequest;
use App\Http\Resources\DirectBookingOrderResource;
use App\Models\DirectBookingOrder;
use App\Services\DirectCheckoutService;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
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

    public function createCheckoutOrder(StoreCheckoutRequest $request, DirectCheckoutService $checkout): JsonResponse
    {
        $result = $checkout->createOrder($request);
        $body = [
            'success' => $result['success'] ?? false,
            'code' => $result['code'],
            'message' => $result['message'],
            'payment' => ['enabled' => false, 'methods' => []],
        ];
        if ($result['order'] !== null) {
            $body['order'] = (new DirectBookingOrderResource($result['order']))->resolve($request);
            $body['resume'] = [
                'reference' => $result['resumeReference'],
                'token' => $result['resumeToken'],
                'path' => '/checkout/'.$result['resumeReference'],
            ];
        }
        $body['idempotentReplay'] = $result['replayed'];

        return response()->json($body, $result['status']);
    }

    public function resumeCheckout(Request $request, string $publicReference): JsonResponse
    {
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        $providedToken = (string) $request->header('X-Checkout-Resume-Token', '');
        if ($order === null || $providedToken === '' || ! hash_equals((string) $order->resume_token, $providedToken)) {
            return response()->json(['success' => false, 'code' => 'checkout_not_found', 'message' => 'Pedido não encontrado.'], 404);
        }

        return response()->json([
            'success' => true,
            'order' => (new DirectBookingOrderResource($order))->resolve($request),
            'payment' => ['enabled' => false, 'methods' => []],
        ]);
    }
}
