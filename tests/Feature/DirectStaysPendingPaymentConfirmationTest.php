<?php

namespace Tests\Feature;

use App\Enums\DirectBookingOrderStatus;
use App\Models\DirectBookingOrder;
use App\Models\DirectBookingPaymentAttempt;
use App\Models\DirectBookingStaysAction;
use App\Services\DirectStaysPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class DirectStaysPendingPaymentConfirmationTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('confirmationCases')]
    public function test_pending_entry_is_completed_only_after_payment_and_never_duplicated(string $mode, bool $approved, bool $confirmed): void
    {
        $this->freezeTime();
        Http::preventStrayRequests();
        config([
            'direct-booking.confirmation_enabled' => true,
            'direct-booking.send_confirmation_email' => false,
            'direct-booking.stays_payment_type' => 'credit',
            'direct-booking.stays_payment_provider_id' => 'provider-fixture',
            'services.stays.base_url' => 'https://stays.test/external/v1',
            'services.stays.client_id' => 'client-fixture',
            'services.stays.client_secret' => 'secret-fixture',
        ]);
        if (in_array($mode, ['legacy_provider', 'historical_snapshot'], true)) {
            config(['direct-booking.stays_cielo_pix_provider_id' => 'new-pix-provider']);
        }
        if ($mode === 'historical_snapshot') {
            config(['direct-booking.stays_payment_provider_id' => 'new-legacy-provider']);
        }
        $cardInstallments = match ($mode) {
            'card_2x' => 2,
            'card_6x' => 6,
            default => null,
        };
        if ($cardInstallments !== null) {
            config(['direct-booking.stays_cielo_card_provider_ids.'.$cardInstallments => 'new-card-provider']);
        }
        $order = DirectBookingOrder::query()->create([
            'status' => $approved ? DirectBookingOrderStatus::PagoEmConfirmacao : DirectBookingOrderStatus::PagamentoPendente,
            'idempotency_key' => fake()->uuid(), 'public_reference' => bin2hex(random_bytes(20)),
            'request_fingerprint' => str_repeat('a', 64), 'listing_id' => 'listing-fixture', 'stays_listing_id' => 'listing-fixture',
            'stays_client_id' => 'guest-fixture', 'stays_reservation_id' => 'reservation-fixture', 'reservation_status' => 'reserved',
            'check_in' => '2026-11-24', 'check_out' => '2026-11-26',
            'guests' => ['adults' => 1, 'children' => 0, 'infants' => 0],
            'guest_name' => 'Synthetic Guest', 'guest_email' => 'guest@example.test', 'guest_phone' => '11999999999',
            'quote_total' => '260.00', 'currency' => 'BRL', 'quote_snapshot' => [],
            'accepted_terms_version' => 'fixture-v1', 'accepted_terms_snapshot' => [], 'terms_accepted_at' => now(),
            'origin' => 'website', 'expires_at' => now()->addHours(3), 'payment_status' => $approved ? 'approved' : 'pending',
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant-fixture', 'operational_events' => [],
        ]);
        $attempt = DirectBookingPaymentAttempt::query()->create([
            'direct_booking_order_id' => $order->id, 'idempotency_key' => fake()->uuid(), 'request_fingerprint' => str_repeat('b', 64),
            'gateway_provider' => 'cielo', 'gateway_merchant_id' => 'merchant-fixture', 'merchant_order_id' => 'order-fixture',
            'gateway_payment_id' => '123e4567-e89b-12d3-a456-426614174001', 'payment_method' => $cardInstallments === null ? 'pix' : 'card', 'payment_method_id' => $cardInstallments === null ? 'pix' : 'cielo_credit_card', 'installments' => $cardInstallments,
            'status' => $approved ? 'approved' : 'pending', 'gateway_status' => $approved ? 'captured' : 'pending',
            'amount' => '260.00', 'base_amount' => '260.00', 'currency' => 'BRL', 'expires_at' => now()->addHours(2),
            'paid_at' => $approved ? now() : null,
        ]);
        $reservation = [
            '_id' => 'reservation-fixture', '_idlisting' => 'listing-fixture', '_idclient' => 'guest-fixture', 'type' => 'reserved',
            'checkInDate' => '2026-11-24', 'checkOutDate' => '2026-11-26', 'guests' => 1,
            'price' => ['currency' => 'BRL', '_f_total' => 260], 'internalNote' => 'CRCN_DIRECT_ORDER:'.$order->id,
        ];
        $payment = [
            '_id' => 'payment-fixture', '_idpaymentProvider' => 'provider-fixture', 'type' => 'credit', '_f_val' => $mode === 'wrong_amount' ? 261 : 260,
            'status' => 'pending', 'expirationDate' => now()->toDateString(), 'readonly' => $mode === 'readonly',
            'desc' => 'CRCN_DIRECT_ORDER:'.$order->id.':CIELO:'.$attempt->gateway_payment_id,
        ];
        DirectBookingStaysAction::query()->create([
            'direct_booking_order_id' => $order->id, 'action_type' => 'register_pending_payment', 'status' => 'succeeded',
            'external_id' => $mode === 'changed_id' ? 'another-payment-fixture' : 'payment-fixture', 'idempotency_key' => fake()->uuid(),
            'request_snapshot' => ['status' => 'pending', '_f_val' => 260, '_idpaymentProvider' => 'provider-fixture'],
        ]);
        $paymentPatches = 0;
        $reservationPatches = 0;
        Http::fake(function (Request $request) use (&$reservation, &$payment, &$paymentPatches, &$reservationPatches, $mode, $cardInstallments) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if ($request->method() === 'GET' && str_ends_with($path, '/payments')) {
                return Http::response([$payment]);
            }
            if ($request->method() === 'GET' && str_ends_with($path, '/reservation-fixture')) {
                return Http::response($reservation);
            }
            if ($request->method() === 'PATCH' && str_ends_with($path, '/payments/payment-fixture')) {
                $paymentPatches++;
                $this->assertSame(['paymentDate' => now()->toDateString(), 'name' => $cardInstallments === null ? 'Pix API Cielo' : 'Cartão API Cielo '.$cardInstallments.'x'], $request->data());
                if ($mode !== 'ignored') {
                    $payment = [...$payment, ...$request->data(), 'status' => 'completed'];
                }
                if ($mode === 'auto_booked') {
                    $reservation['type'] = 'booked';
                }
                if ($mode === 'timeout_saved') {
                    throw new ConnectionException('Synthetic lost response after completed update');
                }

                return Http::response($payment);
            }
            if ($request->method() === 'PATCH' && str_ends_with($path, '/reservation-fixture')) {
                $reservationPatches++;
                $this->assertSame('completed', $payment['status']);
                $this->assertSame(['type' => 'booked'], $request->data());
                $reservation['type'] = 'booked';

                return Http::response($reservation);
            }
            throw new RuntimeException('Unexpected request: '.$request->method().' '.$path);
        });
        $result = app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
        $this->assertSame($confirmed, $result['ready']);
        $this->assertSame($confirmed ? 'booked' : 'reserved', $order->refresh()->reservation_status);
        $this->assertSame($confirmed ? 'completed' : 'pending', $payment['status']);
        $this->assertSame($confirmed || $mode === 'ignored' ? 1 : 0, $paymentPatches);
        $this->assertSame($confirmed && $mode !== 'auto_booked' ? 1 : 0, $reservationPatches);
        if ($confirmed) {
            $this->assertSame(DirectBookingOrderStatus::Confirmado, $order->status);
            $this->assertSame('payment-fixture', $order->staysActions()->where('action_type', 'register_payment')->sole()->external_id);
        }
        app(DirectStaysPaymentService::class)->confirmPaidReservation($order);
        $this->assertLessThanOrEqual(1, $paymentPatches);
        Http::assertNotSent(fn (Request $request): bool => $request->method() === 'POST');
        if (! $approved) {
            Http::assertNothingSent();
            $this->assertArrayNotHasKey('paymentDate', $payment);
        }
    }

    public static function confirmationCases(): array
    {
        return [
            'unpaid Pix remains pending' => ['normal', false, false],
            'approved Pix completes same entry then confirms' => ['normal', true, true],
            'legacy pending entry still confirms after new provider is configured' => ['legacy_provider', true, true],
            'historical recorded provider remains valid when configuration changes' => ['historical_snapshot', true, true],
            'card in 2 installments keeps historical channel and names installments' => ['card_2x', true, true],
            'card in 6 installments keeps historical channel and names installments' => ['card_6x', true, true],
            'Stays auto confirms on payment' => ['auto_booked', true, true],
            'lost PATCH response is reconciled' => ['timeout_saved', true, true],
            'unverified update cannot confirm booking' => ['ignored', true, false],
            'different amount stops confirmation' => ['wrong_amount', true, false],
            'readonly entry cannot be changed' => ['readonly', true, false],
            'changed entry ID stops confirmation' => ['changed_id', true, false],
        ];
    }
}
