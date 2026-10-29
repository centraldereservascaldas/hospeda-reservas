<?php

namespace App\Http\Controllers\Api;

use App\Data\VerifiedGuest;
use App\Http\Controllers\Controller;
use App\Http\Requests\StartStaysCheckoutRequest;
use App\Http\Requests\StoreCheckoutRequest;
use App\Http\Resources\DirectBookingOrderResource;
use App\Models\DirectBookingOrder;
use App\Services\DirectCheckoutService;
use App\Services\DirectSaleTermsRegistry;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\StaysExternalApiClient;
use App\Services\StaysHostedCheckoutService;
use App\Services\StaysSimulator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(
        private readonly StaysExternalApiClient $stays,
    ) {}

    public function price(Request $request, StaysSimulator $simulator): JsonResponse
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
        if ($simulator->enabled()) {
            $result = $simulator->quote($id, $input['from'], $input['to'], (int) $input['guests']);
            if ($result === null) {
                return response()->json(['success' => false, 'message' => 'Acomodação não encontrada na base simulada.'], 404);
            }
            if (($result['reason'] ?? null) === 'invalid_guest_count') {
                return response()->json(['success' => false, 'code' => 'invalid_guest_count', 'message' => 'Quantidade de hóspedes inválida para esta acomodação.'], 400);
            }
            if (! ($result['available'] ?? false)) {
                return response()->json(['success' => false, 'code' => 'availability_unavailable', 'message' => 'Este período não está disponível na simulação.'], 409);
            }

            return response()->json($result['quote']);
        }
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR);
        $property = collect($catalog)->first(fn (array $item): bool => in_array($id, [$item['id'] ?? '', $item['staysListingId'] ?? ''], true));
        $listing = null;
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
        $listing ??= $this->stays->get('/content/listings/'.rawurlencode((string) $staysId));
        $staysListingIds = array_values(array_unique(array_filter([
            (string) $staysId,
            is_string($listing['id'] ?? null) ? $listing['id'] : null,
            is_string($listing['_id'] ?? null) ? $listing['_id'] : null,
        ], fn (mixed $listingId): bool => is_string($listingId) && $listingId !== '')));
        $quoteList = $this->stays->post('/booking/calculate-price', array_filter([
            'from' => $input['from'], 'to' => $input['to'], 'listingIds' => [$staysId], 'guests' => $input['guests'], 'promocode' => $input['promocode'] ?? null,
        ], fn ($value): bool => $value !== null));
        $quote = is_array($quoteList) && array_is_list($quoteList)
            ? collect($quoteList)->first(fn (mixed $item): bool => is_array($item)
                && in_array((string) ($item['_idlisting'] ?? $item['listingId'] ?? ''), $staysListingIds, true))
            : $quoteList;
        $quoteListingId = is_array($quote) ? ($quote['_idlisting'] ?? $quote['listingId'] ?? null) : null;
        if ($quoteListingId !== null && ! in_array((string) $quoteListingId, $staysListingIds, true)) {
            $quote = null;
        }
        if (is_array($quote)) {
            $nights = max(1, now()->parse($input['from'])->diffInDays(now()->parse($input['to'])));
            $price = is_array($quote['bookingPrice'] ?? null) ? $quote['bookingPrice'] : $quote;
            $currency = 'BRL';
            $rawTotal = $price['_mctotal'][$currency] ?? null;
            $feesIncluded = $quote['feesIncluded'] ?? $price['feesIncluded'] ?? null;
            if (! is_numeric($rawTotal) || ! is_finite((float) $rawTotal) || (float) $rawTotal <= 0 || ! is_bool($feesIncluded)) {
                return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'A cotação atual da Stays não trouxe preço e composição de taxas válidos. Tente novamente.'], 503);
            }

            $rawTotal = (float) $rawTotal;
            $hasFees = array_key_exists('fees', $price) || array_key_exists('fees', $quote);
            $fees = $price['fees'] ?? $quote['fees'] ?? [];
            if (! is_array($fees) || ! array_is_list($fees) || (! $feesIncluded && ! $hasFees)) {
                return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'A cotação atual da Stays não trouxe a composição de taxas necessária. Tente novamente.'], 503);
            }

            $cleaning = 0.0;
            $service = 0.0;
            $allFees = 0.0;
            $counterFee = 0.0;
            foreach ($fees as $fee) {
                if (! is_array($fee)) {
                    return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'A cotação atual da Stays trouxe uma taxa inválida. Tente novamente.'], 503);
                }

                $feeValues = is_array($fee['_mcval'] ?? null) ? $fee['_mcval'] : [];
                $amount = $feeValues[$currency] ?? null;
                if (! is_numeric($amount) || ! is_finite((float) $amount) || (float) $amount < 0) {
                    return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'A cotação atual da Stays trouxe uma taxa sem valor válido. Tente novamente.'], 503);
                }
                $amount = (float) $amount;
                $allFees += $amount;
                $title = is_array($fee['_mstitle'] ?? null) ? $fee['_mstitle'] : [];
                $label = mb_strtolower(
                    (is_string($fee['internalName'] ?? null) ? $fee['internalName'] : '')
                    .' '.(is_string($title['pt_BR'] ?? null) ? $title['pt_BR'] : '')
                    .' '.(is_string($title['pt_PT'] ?? null) ? $title['pt_PT'] : '')
                    .' '.(is_string($title['en_US'] ?? null) ? $title['en_US'] : ''),
                );
                if (str_contains($label, 'limpez') || str_contains($label, 'clean')) {
                    $cleaning += $amount;
                }
                if (str_contains($label, 'service') || str_contains($label, 'servi')) {
                    $service += $amount;
                }
                if (preg_match('/balc[aã]o|counter/i', $label) === 1) {
                    $counterFee += $amount;
                }
            }
            if (! is_finite($allFees) || ! is_finite($cleaning) || ! is_finite($service) || ! is_finite($counterFee)) {
                return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'A composição de taxas da cotação atual não é válida. Tente novamente.'], 503);
            }

            $baseTotal = $feesIncluded ? $rawTotal : $rawTotal + $counterFee;
            $total = $feesIncluded ? $rawTotal : $rawTotal + $allFees;
            if (! is_finite($baseTotal) || $baseTotal <= 0 || ! is_finite($total) || $total <= 0) {
                return response()->json(['success' => false, 'code' => 'quote_unavailable', 'message' => 'A cotação atual da Stays não trouxe um total final válido. Tente novamente.'], 503);
            }
            $daily = $baseTotal / $nights;

            return response()->json([
                'success' => true,
                'listingId' => $property['id'],
                'staysListingId' => $staysId,
                'nights' => $nights,
                'dailyRate' => $daily,
                'baseTotal' => $baseTotal,
                'cleaningFee' => $cleaning,
                'serviceFee' => $service,
                'discount' => 0,
                'total' => $total,
                'currency' => $currency,
                'source' => 'stays-live',
                'feesIncluded' => $feesIncluded,
                'fees' => $fees,
                'cleaningIncluded' => $feesIncluded && $cleaning > 0,
                'breakdown' => [
                    'dailyRateText' => 'Hospedagem · '.$nights.' noites',
                    'cleaningFeeText' => 'Taxa de limpeza',
                    'serviceFeeText' => 'Taxas da hospedagem',
                    'totalText' => 'R$ '.number_format($total, 2, ',', '.'),
                ],
            ]);
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
        $fallbackCount = count(json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true, flags: JSON_THROW_ON_ERROR));
        if (! $this->stays->isConfigured()) {
            return response()->json(['connected' => false, 'hasCredentials' => false, 'totalProperties' => $fallbackCount, 'message' => 'Credenciais Stays não configuradas no servidor.'], 503);
        }
        $listings = $this->stays->activeListings();
        if ($listings === null) {
            return response()->json(['connected' => false, 'hasCredentials' => true, 'totalProperties' => $fallbackCount, 'message' => 'Falha ao autenticar ou consultar a API Stays.'], 503);
        }

        return response()->json(['connected' => true, 'hasCredentials' => true, 'totalProperties' => count($listings), 'environment' => app()->environment()]);
    }

    public function createCheckoutOrder(
        StoreCheckoutRequest $request,
        DirectCheckoutService $checkout,
        DirectCheckoutPaymentService $payments,
    ): JsonResponse {
        $result = $checkout->createOrder($request);
        $order = $result['order'];
        $paymentMethods = $payments->availableMethods($order);
        $body = [
            'success' => $result['success'] ?? false,
            'code' => $result['code'],
            'message' => $result['message'],
            'payment' => [
                'enabled' => $paymentMethods !== [],
                'methods' => $paymentMethods,
                'publicKey' => $payments->publicKey($order),
                'provider' => $payments->provider($order),
            ],
        ];
        if ($result['order'] !== null) {
            $body['order'] = (new DirectBookingOrderResource($result['order']))->resolve($request);
            $body['resume'] = [
                'reference' => $result['resumeReference'],
                'token' => $result['resumeToken'],
                'path' => '/checkout/'.$result['resumeReference'],
                'expiresAt' => $result['order']->resume_token_expires_at?->toISOString(),
            ];
        }
        $body['idempotentReplay'] = $result['replayed'];

        return response()->json($body, $result['status'])
            ->header('Cache-Control', 'no-store, private');
    }

    public function startStaysCheckout(
        StartStaysCheckoutRequest $request,
        StaysHostedCheckoutService $checkout,
    ): JsonResponse {
        $result = $checkout->start($request->validated());

        return response()->json($result['body'], $result['status'])
            ->header('Cache-Control', 'no-store, private');
    }

    public function staysCheckoutReadiness(StaysHostedCheckoutService $checkout): JsonResponse
    {
        return response()->json($checkout->readiness())
            ->header('Cache-Control', 'no-store, private');
    }

    public function checkoutTerms(string $listingId, DirectSaleTermsRegistry $terms): JsonResponse
    {
        $listing = $terms->findApprovedListing($listingId);
        if ($listing === null) {
            return response()->json([
                'success' => false,
                'code' => 'checkout_conditions_unavailable',
                'message' => 'As condições aprovadas para este imóvel ainda não estão disponíveis.',
            ], 503);
        }

        $snapshot = $listing['directSaleTermsSnapshot'];

        return response()->json([
            'success' => true,
            'terms' => [
                'version' => $listing['directSaleTermsVersion'],
                'snapshot' => $snapshot,
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function checkoutReadiness(
        string $listingId,
        DirectSaleTermsRegistry $terms,
        DirectCheckoutPaymentService $payments,
    ): JsonResponse {
        $approvedListing = $terms->findApprovedListing($listingId);
        $paymentMethods = $payments->availableMethods();
        $holdMinutes = filter_var(config('direct-booking.reservation_hold_minutes'), FILTER_VALIDATE_INT);
        $checkoutReady = config('direct-booking.enabled', false)
            && $approvedListing !== null
            && $this->stays->isConfigured()
            && $holdMinutes !== false
            && $holdMinutes >= 1
            && $holdMinutes <= 1440;
        $ready = $checkoutReady && $paymentMethods !== [];

        $singlePageCheckoutEnabled = (bool) config('direct-booking.checkout_ui_enabled', false)
            && $ready
            && in_array($payments->provider(), ['cielo', 'cielo_sandbox'], true)
            && in_array('card', $paymentMethods, true);

        return response()->json([
            'success' => true,
            'ready' => $ready,
            'termsAvailable' => $approvedListing !== null,
            'checkoutEnabled' => $checkoutReady,
            'singlePageCheckoutEnabled' => $singlePageCheckoutEnabled,
            'parkTicketsPreviewEnabled' => $singlePageCheckoutEnabled
                && app()->environment(['local', 'testing'])
                && (bool) config('park-tickets.preview_enabled', false),
            'payment' => [
                'enabled' => $paymentMethods !== [],
                'methods' => $paymentMethods,
                'publicKey' => $payments->publicKey(),
                'provider' => $payments->provider(),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function resumeCheckout(
        Request $request,
        string $publicReference,
        DirectCheckoutPaymentService $payments,
    ): JsonResponse {
        $order = DirectBookingOrder::query()->where('public_reference', $publicReference)->first();
        $providedToken = (string) $request->header('X-Checkout-Resume-Token', '');
        $guest = $request->attributes->get('verified_guest');
        $isAuthorizedGuest = $guest instanceof VerifiedGuest
            && hash_equals($order?->guest_email ?? '', mb_strtolower(trim($guest->email)));
        $isValidResumeToken = $order?->hasValidResumeToken($providedToken) ?? false;
        if ($order === null || (! $isAuthorizedGuest && ! $isValidResumeToken)) {
            return response()->json(['success' => false, 'code' => 'checkout_not_found', 'message' => 'Pedido não encontrado.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }

        $attempt = $order->paymentAttempts()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();
        $paymentMethods = $payments->availableMethods($order);
        $pixInstructions = $attempt?->safePixInstructions($order->status->value === 'pagamento_pendente');
        $cieloCheckoutUrl = $attempt?->safeCieloCheckoutUrl($order->status->value === 'pagamento_pendente');
        $confirmation = null;
        if ($order->status->value === 'confirmado' && $order->payment_status === 'approved') {
            $confirmationAction = $order->confirmedReservationAction();
            $confirmation = [
                'reservationCode' => $order->confirmedReservationCode($confirmationAction),
                'confirmedAt' => $confirmationAction?->completed_at?->toISOString(),
            ];
        }

        return response()->json([
            'success' => true,
            'order' => (new DirectBookingOrderResource($order))->resolve($request),
            'confirmation' => $confirmation,
            'payment' => [
                'enabled' => $paymentMethods !== [],
                'methods' => $paymentMethods,
                'publicKey' => $payments->publicKey($order),
                'provider' => $payments->provider($order),
                'attempt' => $attempt === null ? null : [
                    'status' => $attempt->status,
                    'method' => $attempt->payment_method,
                    'amount' => $attempt->amount,
                    'currency' => $attempt->currency,
                    'expiresAt' => $attempt->expires_at?->toISOString(),
                    'paidAt' => $attempt->paid_at?->toISOString(),
                    'checkoutUrl' => $cieloCheckoutUrl,
                    'pix' => $attempt->payment_method === 'pix' ? [
                        'copyPaste' => $pixInstructions['copyPaste'],
                        'qrCodeBase64' => $pixInstructions['qrCodeBase64'],
                    ] : null,
                ],
            ],
        ])->header('Cache-Control', 'no-store, private');
    }
}
