<?php

namespace Tests\Unit;

use App\Services\AffiliateCommissionCalculator;
use PHPUnit\Framework\TestCase;

class AffiliateCommissionCalculatorTest extends TestCase
{
    public function test_calculates_default_three_and_a_half_percent_in_cents(): void
    {
        $calculator = new AffiliateCommissionCalculator;

        $amount = $calculator->calculateCents('100.00', 'BRL', null);

        $this->assertSame(350, $amount);
        $this->assertSame(350, $calculator->calculateCents('100', 'BRL', null));
    }

    public function test_calculates_the_conversion_rate_snapshot_with_half_up_rounding(): void
    {
        $calculator = new AffiliateCommissionCalculator;

        $amount = $calculator->calculateCents('3001.00', 'BRL', 500);

        $this->assertSame(15005, $amount);
        $this->assertSame(4, $calculator->calculateCents('1.00', 'BRL', 350));
    }

    public function test_refuses_unsupported_currency_or_invalid_amounts(): void
    {
        $calculator = new AffiliateCommissionCalculator;

        $this->assertNull($calculator->calculateCents('100.00', 'USD', 350));
        $this->assertNull($calculator->calculateCents('0.00', 'BRL', 350));
        $this->assertNull($calculator->calculateCents('100.00', 'BRL', 0));
        $this->assertNull($calculator->calculateCents('invalid', 'BRL', 350));
    }
}
