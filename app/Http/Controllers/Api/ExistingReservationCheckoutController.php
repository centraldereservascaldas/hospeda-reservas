<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExistingReservationCheckoutRequest;
use App\Http\Resources\DirectBookingOrderResource;
use App\Services\ExistingReservationBalance;
use App\Services\ExistingReservationBalanceApproval;
use App\Services\ExistingReservationBootstrapOrigin;
use App\Services\ExistingReservationCheckoutDetails;
use App\Services\ExistingReservationCheckoutService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\MoneyAmount;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExistingReservationCheckoutController extends Controller
{
    public function show(string $code, StaysExternalApiClient $stays, ExistingReservationBalance $balance, DirectCheckoutPaymentService $gateway, ExistingReservationPaymentChannels $channels): JsonResponse
    {
        $headers = ['Cache-Control' => 'no-store, private', 'X-Robots-Tag' => 'noindex, nofollow'];
        if (config('direct-booking.existing_reservation_checkout_enabled', false) !== true) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
        }
        if (! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
        }

        $reservation = $stays->get('/booking/reservations/'.$code);
        if (! is_array($reservation)) {
            return response()->json(['success' => false, 'message' => 'Não foi possível consultar esta reserva agora.'], 503, $headers);
        }
        if (($reservation['id'] ?? null) !== $code || ! in_array($reservation['type'] ?? null, ['reserved', 'booked'], true)) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
        }
        $guestPrefill = ['fullName' => '', 'email' => '', 'phone' => ''];
        $clientId = $reservation['_idclient'] ?? null;
        if (is_string($clientId) && preg_match('/^[a-f0-9]{24}$/iD', $clientId)) {
            $client = $stays->get('/booking/clients/'.rawurlencode($clientId));
            if (is_array($client) && ($client['_id'] ?? null) === $clientId) {
                $firstName = is_string($client['fName'] ?? null) ? trim($client['fName']) : '';
                $lastName = is_string($client['lName'] ?? null) ? trim($client['lName']) : '';
                $name = trim($firstName.' '.$lastName);
                $guestPrefill['fullName'] = mb_strlen($name) <= 180 ? $name : '';
                $email = is_string($client['email'] ?? null) ? trim($client['email']) : '';
                $guestPrefill['email'] = mb_strlen($email) <= 254 ? $email : '';
                $phones = is_array($client['phones'] ?? null) ? $client['phones'] : [];
                foreach ($phones as $phone) {
                    if (is_array($phone) && is_string($phone['iso'] ?? null) && trim($phone['iso']) !== '') {
                        $value = trim($phone['iso']);
                        $guestPrefill['phone'] = mb_strlen($value) <= 40 ? $value : '';
                        break;
                    }
                }
            }
        }
        $payments = $stays->get('/booking/reservations/'.$code.'/payments');
        $paymentReview = is_array($payments) ? $balance->inspect($reservation, $payments) : ['status' => 'review_required', 'candidate_cents' => null];
        if ($paymentReview['status'] === 'pending_candidate' && is_array($payments)
            && app(ExistingReservationBootstrapOrigin::class)->requiresReview($reservation['_id'] ?? null, $payments, $paymentReview['payment_id'] ?? null)) {
            $paymentReview = ['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null];
        }
        if (config('direct-booking.experimental_existing_ledger_audit_enabled', false) === true
            && in_array($paymentReview['status'], ['pending_candidate', 'unrecorded_candidate'], true)) {
            $id = $reservation['_id'] ?? null;
            $total = MoneyAmount::toCents($reservation['price']['_f_total'] ?? null);
            $candidate = $paymentReview['candidate_cents'] ?? null;
            $pending = is_array($payments) ? array_values(array_filter($payments, fn (mixed $payment): bool => is_array($payment)
                && ($payment['_id'] ?? null) === ($paymentReview['payment_id'] ?? null))) : [];
            $verified = is_string($id) && is_int($total) && is_int($candidate)
                && ($paymentReview['status'] === 'pending_candidate'
                    ? count($pending) === 1 && app(ExistingReservationLedgerAudit::class)->confirmsSnapshot([
                        'reservation_code' => $code, '_id' => $id, 'reservation_total_cents' => $total, 'pending_amount_cents' => $candidate,
                        'payment_id' => $paymentReview['payment_id'], 'pending_provider_id' => $pending[0]['_idpaymentProvider'] ?? null])
                    : app(ExistingReservationLedgerAudit::class)->confirmsCandidate($code, $id, $total, $candidate));
            if (! $verified) {
                $paymentReview = ['status' => 'review_required', 'candidate_cents' => null, 'payment_id' => null];
            }
        }
        $price = $reservation['price'] ?? [];
        $total = is_array($price) && ($price['currency'] ?? null) === 'BRL' ? MoneyAmount::toCents($price['_f_total'] ?? null) : null;
        $listingId = $reservation['_idlisting'] ?? null;
        $catalog = json_decode(file_get_contents(resource_path('data/stays-apartments.json')), true);
        $property = collect(is_array($catalog) ? $catalog : [])->first(fn ($item) => is_array($item) && is_string($listingId) && in_array($listingId, [$item['id'] ?? null, $item['staysListingId'] ?? null], true));
        if (! is_array($property) && is_string($listingId) && preg_match('/^[a-f0-9]{24}$/iD', $listingId)) {
            $listing = $stays->get('/content/listings/'.rawurlencode($listingId));
            if (is_array($listing) && in_array($listingId, [$listing['_id'] ?? null, $listing['id'] ?? null], true)) {
                $titles = is_array($listing['_mstitle'] ?? null) ? $listing['_mstitle'] : [];
                $imageMeta = is_array($listing['_t_mainImageMeta'] ?? null) ? $listing['_t_mainImageMeta'] : [];
                $title = $titles['pt_BR'] ?? null;
                $image = $imageMeta['url'] ?? null;
                $property = [
                    'title' => is_string($title) && trim($title) !== '' ? trim($title) : null,
                    'images' => is_string($image) && str_starts_with($image, 'https://') ? [$image] : [],
                ];
            }
        }
        $guests = $reservation['guestsDetails'] ?? [];
        $guests = is_array($guests) ? $guests : [];
        $available = ['methods' => [], 'card_installments' => []];
        $details = app(ExistingReservationCheckoutDetails::class);
        if ($details->validGuests($reservation) && $details->validIdentity($reservation)
            && config('direct-booking.existing_reservation_checkout_enabled', false)
            && CieloDirectConfiguration::isProvider((string) config('direct-booking.payment_provider')) && is_array($payments)) {
            if ($paymentReview['status'] === 'pending_candidate') {
                $available = $channels->availableForReceivable($gateway->availableMethods(), $payments, $paymentReview['payment_id'] ?? null);
            } elseif ($paymentReview['status'] === 'unrecorded_candidate'
                && config('direct-booking.experimental_existing_receivable_creation_enabled', false) === true
                && ExistingReservationBalanceApproval::version(ExistingReservationBalanceApproval::projection($reservation, $paymentReview['candidate_cents'])) !== null) {
                $available = $channels->availableForNewReceivable($gateway->availableMethods());
            }
        }
        $methods = $available['methods'];

        return response()->json([
            'success' => true,
            'reservation' => [
                'code' => $code,
                'guestPrefill' => $guestPrefill,
                'status' => $reservation['type'],
                'listingId' => is_string($listingId) ? $listingId : null,
                'property' => is_array($property) ? ($property['title'] ?? null) : null,
                'image' => is_array($property) ? ($property['images'][0] ?? null) : null,
                'checkIn' => $reservation['checkInDate'] ?? null,
                'checkOut' => $reservation['checkOutDate'] ?? null,
                'guests' => $reservation['guests'] ?? null,
                'adults' => $guests['adults'] ?? null,
                'children' => $guests['children'] ?? null,
                'infants' => $guests['infants'] ?? null,
                'totalCents' => $total,
                'candidateBalanceCents' => $paymentReview['candidate_cents'],
                'balanceStatus' => $paymentReview['status'],
                'paymentEnabled' => $methods !== [],
                'paymentMethods' => $methods,
                'cardInstallments' => $available['card_installments'],
            ],
        ], 200, $headers);
    }

    public function recover(Request $request, string $code, ExistingReservationCheckoutService $checkout): JsonResponse
    {
        $order = $checkout->recoverByIntent($code, $request->header('Idempotency-Key'));
        $response = $order === null ? ['success' => false, 'code' => 'existing_checkout_unavailable'] : [
            'success' => true,
            'resume' => ['reference' => $order->public_reference, 'token' => $order->resume_token,
                'path' => '/checkout/'.$order->public_reference, 'expiresAt' => $order->resume_token_expires_at?->toISOString()],
        ];

        return response()->json($response, $order === null ? 404 : 200)->header('Cache-Control', 'no-store, private');
    }

    public function store(StoreExistingReservationCheckoutRequest $request, string $code, ExistingReservationCheckoutService $checkout, DirectCheckoutPaymentService $gateway): JsonResponse
    {
        $result = $checkout->create($code, $request->validated(), $request->attributes->get('existing_checkout_intent_verified') === true);
        $order = $result['order'];
        $response = ['success' => $order !== null, 'code' => $result['code'], 'replayed' => $order !== null && $result['status'] === 200];
        if ($order !== null) {
            $methods = app(ExistingReservationPaymentChannels::class)->availableMethods($gateway->availableMethods($order));
            $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
            if (is_array($snapshot) && ($snapshot['bootstrap_receivable'] ?? false) === true) {
                $selected = $snapshot['selected_payment_method'] ?? null;
                $methods = array_values(array_filter($methods, fn (mixed $method): bool => is_string($selected) && $method === $selected));
            }
            $response['order'] = (new DirectBookingOrderResource($order))->resolve($request);
            $response['resume'] = ['reference' => $order->public_reference, 'token' => $order->resume_token, 'path' => '/checkout/'.$order->public_reference, 'expiresAt' => $order->resume_token_expires_at?->toISOString()];
            $response['payment'] = ['enabled' => $methods !== [], 'methods' => $methods, 'publicKey' => $gateway->publicKey($order), 'provider' => $gateway->provider($order)];
        }

        return response()->json($response, $result['status'])->header('Cache-Control', 'no-store, private');
    }
}
