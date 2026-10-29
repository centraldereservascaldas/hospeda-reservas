<?php

namespace Tests\Unit;

use App\Services\Payments\CieloCardPricing;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class CieloCardPricingTest extends TestCase
{
    #[DataProvider('installmentRates')]
    public function test_it_grosses_up_the_card_total_and_preserves_the_base_amount(
        int $installments,
        int $rateBasisPoints,
        int $totalCents,
    ): void {
        $pricing = (new CieloCardPricing)->calculate('3001.00', $installments);

        $this->assertSame(300100, $pricing['baseCents']);
        $this->assertSame($rateBasisPoints, $pricing['rateBasisPoints']);
        $this->assertSame($totalCents, $pricing['totalCents']);
        $this->assertSame($totalCents - 300100, $pricing['feeCents']);
        $this->assertGreaterThanOrEqual(300100, intdiv($totalCents * (10_000 - $rateBasisPoints), 10_000));
    }

    public static function installmentRates(): array
    {
        return [
            'cash credit 5.99%' => [1, 599, 319222],
            'two installments 12.5%' => [2, 1250, 342972],
            'three installments 12.5%' => [3, 1250, 342972],
            'four installments 18%' => [4, 1800, 365976],
            'five installments 18%' => [5, 1800, 365976],
            'six installments 18%' => [6, 1800, 365976],
        ];
    }
}
