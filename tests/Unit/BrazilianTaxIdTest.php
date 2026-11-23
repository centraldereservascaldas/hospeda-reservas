<?php

namespace Tests\Unit;

use App\Services\BrazilianTaxId;
use PHPUnit\Framework\TestCase;

class BrazilianTaxIdTest extends TestCase
{
    /**
     * A basic unit test example.
     */
    public function test_validates_numeric_cpf_and_cnpj(): void
    {
        self::assertTrue(BrazilianTaxId::isValid('CPF', '52998224725'));
        self::assertTrue(BrazilianTaxId::isValid('CNPJ', '11222333000181'));
    }

    public function test_validates_receita_federal_alphanumeric_cnpj_example(): void
    {
        self::assertTrue(BrazilianTaxId::isValid('CNPJ', '12ABC34501DE35'));
        self::assertTrue(BrazilianTaxId::isValid('CNPJ', '12abc34501de35'));
        self::assertFalse(BrazilianTaxId::isValid('CNPJ', '12ABC34501DE36'));
        self::assertFalse(BrazilianTaxId::isValid('CNPJ', '12ABC34501DE3A'));
    }
}
