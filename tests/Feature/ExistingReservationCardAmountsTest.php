<?php

namespace Tests\Feature;

use App\Models\DirectBookingPaymentAttempt;
use App\Services\ExistingReservationCardAmounts;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Synthetic arithmetic only; does not establish how Stays treats payment fees. */
class ExistingReservationCardAmountsTest extends TestCase
{
    #[DataProvider('amounts')]
    public function test_captured_card_base_and_surcharge_match_pricing(int $installments, string $total, string $fee, int $rate): void
    {
        $attempt = new DirectBookingPaymentAttempt(['payment_method' => 'card', 'currency' => 'BRL', 'installments' => $installments,
            'base_amount' => '100.00', 'amount' => $total, 'processing_fee_amount' => $fee, 'processing_fee_basis_points' => $rate]);
        $service = app(ExistingReservationCardAmounts::class);
        $this->assertTrue($service->matches($attempt, 10000));
        $attempt->amount = '100.00';
        $this->assertFalse($service->matches($attempt, 10000));
        $attempt->amount = $total;
        $attempt->processing_fee_amount = '0.00';
        $this->assertFalse($service->matches($attempt, 10000));
        $attempt->processing_fee_amount = $fee;
        $attempt->processing_fee_basis_points = $rate + 1;
        $this->assertFalse($service->matches($attempt, 10000));
        $this->assertFalse($service->matches($attempt, 9999));
    }

    public static function amounts(): array
    {
        return ['1x' => [1, '106.38', '6.38', 599], '3x' => [3, '114.29', '14.29', 1250], '6x' => [6, '121.96', '21.96', 1800]];
    }

    public function test_missing_invalid_or_non_card_values_do_not_pass(): void
    {
        $attempt = new DirectBookingPaymentAttempt(['payment_method' => 'card', 'currency' => 'BRL', 'installments' => 7,
            'base_amount' => '100.00', 'amount' => '121.96', 'processing_fee_amount' => '21.96', 'processing_fee_basis_points' => 1800]);
        $service = app(ExistingReservationCardAmounts::class);
        $this->assertFalse($service->matches($attempt, 10000));
        $attempt->installments = 6;
        $attempt->processing_fee_amount = null;
        $this->assertFalse($service->matches($attempt, 10000));
        $attempt->payment_method = 'pix';
        $this->assertFalse($service->matches($attempt, 10000));
    }
}
