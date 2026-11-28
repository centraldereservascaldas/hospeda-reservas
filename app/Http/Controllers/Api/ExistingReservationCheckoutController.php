<?php

namespace App\Http\Controllers\Api;

use App\Enums\DirectBookingOrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\RecoverExistingReservationCheckoutRequest;
use App\Http\Requests\StoreExistingReservationCheckoutRequest;
use App\Http\Resources\DirectBookingOrderResource;
use App\Models\DirectBookingOrder;
use App\Services\ExistingCheckoutRecoveryCredential;
use App\Services\ExistingReservationBalance;
use App\Services\ExistingReservationBootstrapOrigin;
use App\Services\ExistingReservationCheckoutDetails;
use App\Services\ExistingReservationCheckoutRecoveryService;
use App\Services\ExistingReservationCheckoutService;
use App\Services\ExistingReservationLedgerAudit;
use App\Services\ExistingReservationPaymentChannels;
use App\Services\ExistingReservationPaymentPlanPolicy;
use App\Services\ExistingReservationPropertySummary;
use App\Services\ExperimentalExistingCycleSettlement;
use App\Services\MoneyAmount;
use App\Services\Payments\CieloDirectConfiguration;
use App\Services\Payments\DirectCheckoutPaymentService;
use App\Services\StaysExternalApiClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ExistingReservationCheckoutController extends Controller
{
    public function recoveryCredential(string $code, ExistingCheckoutRecoveryCredential $credentials): JsonResponse
    {
        $headers = ['Cache-Control' => 'no-store, private', 'X-Robots-Tag' => 'noindex, nofollow'];
        if (! preg_match('/^[A-Z0-9]{5}$/D', $code)) {
            return response()->json(['success' => false], 404, $headers);
        }

        return response()->json(['success' => true, 'credential' => $credentials->issue($code)], 200, $headers);
    }

    public function recover(RecoverExistingReservationCheckoutRequest $request, string $code, ExistingReservationCheckoutRecoveryService $recovery): JsonResponse
    {
        $headers = ['Cache-Control' => 'no-store, private', 'X-Robots-Tag' => 'noindex, nofollow'];
        $result = $recovery->recover($code, $request->validated('recoverySecret'));

        if ($result['kind'] === 'resume') {
            return response()->json(['success' => true, 'resume' => [
                'reference' => $result['reference'],
                'token' => $result['token'],
                'expiresAt' => $result['expiresAt'],
            ]], 200, $headers);
        }

        if ($result['kind'] === 'restart') {
            return response()->json(['success' => true, 'restart' => true], 200, $headers);
        }

        return response()->json(['success' => false], 404, $headers);
    }

    public function show(string $code, StaysExternalApiClient $stays, ExistingReservationBalance $balance, DirectCheckoutPaymentService $gateway, ExistingReservationPaymentChannels $channels, ExistingReservationPropertySummary $propertySummary): JsonResponse
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
        if (($reservation['id'] ?? null) !== $code) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
        }
        if (($reservation['type'] ?? null) !== 'reserved') {
            if (($reservation['type'] ?? null) === 'booked') {
                $price = $reservation['price'] ?? null;
                $reservationTotal = is_array($price) && ($price['currency'] ?? null) === 'BRL'
                    ? MoneyAmount::toCents($price['_f_total'] ?? null)
                    : null;
                $reportedPaid = $balance->reportedPaid($reservation);
                if (is_int($reservationTotal) && $reservationTotal > 0
                    && ($reportedPaid['present'] ?? false) === true
                    && is_int($reportedPaid['cents'] ?? null)
                    && $reportedPaid['cents'] >= $reservationTotal) {
                    return response()->json([
                        'success' => true,
                        'reservation' => ['code' => $code, 'state' => 'completed'],
                    ], 200, $headers);
                }

                return $this->settledCheckoutSummary($code, $reservation, $stays, $headers);
            }

            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
        }
        $price = $reservation['price'] ?? null;
        $reservationTotal = is_array($price) && ($price['currency'] ?? null) === 'BRL'
            ? MoneyAmount::toCents($price['_f_total'] ?? null)
            : null;
        $reportedPaid = $balance->reportedPaid($reservation);
        if (($reservation['type'] ?? null) === 'reserved' && is_int($reservationTotal) && $reservationTotal > 0
            && ($reportedPaid['present'] ?? false) === true && is_int($reportedPaid['cents'] ?? null)
            && $reportedPaid['cents'] >= $reservationTotal) {
            return response()->json(['success' => false, 'message' => 'Não foi possível consultar esta reserva agora.'], 503, $headers);
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
        $property = $propertySummary->find($listingId);
        $guests = $reservation['guestsDetails'] ?? [];
        $guests = is_array($guests) ? $guests : [];
        $available = ['methods' => [], 'card_installments' => []];
        $details = app(ExistingReservationCheckoutDetails::class);
        $reportedPaid = $balance->reportedPaid($reservation);
        $policy = app(ExistingReservationPaymentPlanPolicy::class);
        $fullAvailable = $policy->fullBalanceMatches($reservation, $paymentReview, $reportedPaid);
        $depositAvailable = $policy->depositMatches($reservation, $paymentReview, $reportedPaid);
        if (($fullAvailable || $depositAvailable)
            && $details->validGuests($reservation) && $details->validIdentity($reservation)
            && config('direct-booking.existing_reservation_checkout_enabled', false)
            && CieloDirectConfiguration::isProvider((string) config('direct-booking.payment_provider')) && is_array($payments)) {
            if ($paymentReview['status'] === 'pending_candidate') {
                $available = $channels->availableForReceivable($gateway->availableMethods(), $payments, $paymentReview['payment_id'] ?? null);
            } elseif ($paymentReview['status'] === 'unrecorded_candidate' && $reportedPaid !== null
                && $reportedPaid['present'] && is_int($reportedPaid['cents'])) {
                $available = $channels->availableForNewReceivable($gateway->availableMethods());
            }
        }
        $depositMethods = $depositAvailable ? array_values(array_intersect($available['methods'], ['pix'])) : [];
        $methods = $fullAvailable ? $available['methods'] : [];
        $available['card_installments'] = $fullAvailable ? $available['card_installments'] : [];

        return response()->json([
            'success' => true,
            'reservation' => [
                'code' => $code,
                'status' => $reservation['type'],
                'listingId' => is_string($listingId) ? $listingId : null,
                'property' => is_array($property) ? ($property['title'] ?? null) : null,
                'propertyDetails' => is_array($property) ? array_intersect_key($property, array_flip(['images', 'description', 'condoTitle', 'condoDescription', 'condoImages'])) : null,
                'image' => is_array($property) ? ($property['images'][0] ?? null) : null,
                'checkIn' => $reservation['checkInDate'] ?? null,
                'checkOut' => $reservation['checkOutDate'] ?? null,
                'guests' => $reservation['guests'] ?? null,
                'adults' => $guests['adults'] ?? null,
                'children' => $guests['children'] ?? null,
                'infants' => $guests['infants'] ?? null,
                'totalCents' => $total,
                'candidateBalanceCents' => $paymentReview['candidate_cents'],
                'outstandingBalanceCents' => is_int($total) && ($reportedPaid['present'] ?? false) === true && is_int($reportedPaid['cents'] ?? null)
                    ? max(0, $total - $reportedPaid['cents']) : null,
                'balanceStatus' => $paymentReview['status'],
                'paymentEnabled' => $methods !== [],
                'paymentPlans' => [
                    'full' => ['methods' => $methods, 'amountCents' => $methods !== [] ? $paymentReview['candidate_cents'] : null],
                    'deposit' => ['methods' => $depositMethods, 'amountCents' => $depositMethods !== [] ? intdiv($total + 1, 2) : null],
                ],
                'paymentMethods' => $methods,
                'cardInstallments' => $available['card_installments'],
            ],
        ], 200, $headers);
    }

    /** @param array<string, mixed> $reservation
     * @param  array<string, string>  $headers
     */
    private function settledCheckoutSummary(string $code, array $reservation, StaysExternalApiClient $stays, array $headers): JsonResponse
    {
        $id = $reservation['_id'] ?? null;
        if (! is_string($id) || ! preg_match('/^[a-f0-9]{24}$/iD', $id)) {
            return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
        }

        $orders = DirectBookingOrder::query()
            ->where('origin', 'stays_existing')
            ->whereRaw('LOWER(stays_reservation_id) = ?', [strtolower($id)])
            ->where('status', DirectBookingOrderStatus::EntradaConciliada)
            ->where('payment_status', 'approved')
            ->latest('created_at')
            ->get();
        foreach ($orders as $order) {
            $snapshot = $order->quote_snapshot['existing_reservation'] ?? null;
            if (! is_array($snapshot) || ($snapshot['reservation_code'] ?? null) !== $code
                || ($snapshot['payment_plan'] ?? null) !== 'deposit'
                || $order->reservation_status !== 'booked') {
                continue;
            }
            $cycle = DB::table('existing_reservation_payment_cycles')
                ->where('direct_booking_order_id', $order->id)->where('state', 'settled')->first();
            $audit = $cycle ? app(ExperimentalExistingCycleSettlement::class)->revalidateHistorical($cycle) : null;
            if (! is_array($audit) || ($audit['total_cents'] ?? null) !== ($snapshot['reservation_total_cents'] ?? null)
                || ! is_int($audit['balance_cents'] ?? null) || $audit['balance_cents'] <= 0) {
                continue;
            }

            return response()->json(['success' => true, 'reservation' => [
                'code' => $code,
                'state' => 'completed',
                'status' => 'booked',
                'totalCents' => $audit['total_cents'],
                'outstandingBalanceCents' => $audit['balance_cents'],
                'paidCents' => $audit['paid_cents'],
            ]], 200, $headers);
        }

        return response()->json(['success' => false, 'message' => 'Reserva não encontrada.'], 404, $headers);
    }

    public function store(StoreExistingReservationCheckoutRequest $request, string $code, ExistingReservationCheckoutService $checkout, DirectCheckoutPaymentService $gateway): JsonResponse
    {
        $result = $checkout->create($code, $request->validated());
        $order = $result['order'];
        $response = ['success' => $order !== null, 'code' => $result['code']];
        if ($order !== null) {
            $methods = $result['code'] === 'existing_checkout_replay_only'
                ? []
                : app(ExistingReservationPaymentChannels::class)->availableMethods($gateway->availableMethods($order));
            $snapshot = is_array($order->quote_snapshot) ? ($order->quote_snapshot['existing_reservation'] ?? null) : null;
            if (is_array($snapshot) && ! app(ExistingReservationPaymentPlanPolicy::class)->canStartOrderPayment($order, (string) ($snapshot['selected_payment_method'] ?? ''))) {
                $methods = [];
            }
            if (is_array($snapshot)) {
                $selected = $snapshot['selected_payment_method'] ?? null;
                if (is_string($selected)) {
                    $methods = array_values(array_filter($methods, fn (mixed $method): bool => $method === $selected));
                }
            }
            $response['order'] = (new DirectBookingOrderResource($order))->resolve($request);
            $response['resume'] = ['reference' => $order->public_reference, 'token' => $order->resume_token, 'path' => '/checkout/'.$order->public_reference, 'expiresAt' => $order->resume_token_expires_at?->toISOString()];
            $response['payment'] = ['enabled' => $methods !== [], 'methods' => $methods, 'publicKey' => $gateway->publicKey($order), 'provider' => $gateway->provider($order)];
        }

        return response()->json($response, $result['status'])->header('Cache-Control', 'no-store, private');
    }
}
