import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalculatedPriceResponse } from '../src/services/crcnBackendApi.ts';
import {
  calculatePropertyPricing,
  getPropertyFeeAmount,
  getPropertyFeeLabel,
} from '../src/utils/propertyPricing.ts';

const quote = (overrides: Partial<CalculatedPriceResponse> = {}): CalculatedPriceResponse => ({
  success: true,
  listingId: 'listing-1',
  nights: 2,
  dailyRate: 500,
  baseTotal: 1000,
  cleaningFee: 80,
  serviceFee: 30,
  discount: 50,
  total: 1060,
  currency: 'BRL',
  breakdown: {
    dailyRateText: 'Diária',
    cleaningFeeText: 'Limpeza',
    serviceFeeText: 'Serviço',
    totalText: 'Total',
  },
  ...overrides,
});

test('calculates an estimate from property rates when there is no live quote', () => {
  assert.deepEqual(
    calculatePropertyPricing({
      nightlyRate: 500,
      cleaningFee: 80,
      serviceFeeRate: 0.1,
      nights: 2,
      quote: null,
    }),
    {
      baseSubtotal: 1000,
      discount: 0,
      cleaningFee: 80,
      serviceFee: 100,
      totalAmount: 1180,
      visibleFees: [],
    },
  );
});

test('uses live quote totals and hides counter fees from the separate fee list', () => {
  const liveQuote = quote({
    fees: [
      { internalName: 'Taxa de limpeza', _mcval: { BRL: 80 } },
      { internalName: 'Tarifa balcão', _mcval: { BRL: 900 } },
    ],
  });

  const pricing = calculatePropertyPricing({
    nightlyRate: 999,
    cleaningFee: 999,
    serviceFeeRate: 0.5,
    nights: 1,
    quote: liveQuote,
  });

  assert.equal(pricing.baseSubtotal, 1000);
  assert.equal(pricing.discount, 50);
  assert.equal(pricing.cleaningFee, 80);
  assert.equal(pricing.serviceFee, 30);
  assert.equal(pricing.totalAmount, 1060);
  assert.deepEqual(pricing.visibleFees, [liveQuote.fees?.[0]]);
});

test('formats PMS fee labels and falls back to BRL amounts', () => {
  const fee = {
    internalName: 'Taxa local',
    _mstitle: { pt_BR: 'Taxa municipal' },
    _mcval: { BRL: 25 },
  };
  assert.equal(getPropertyFeeLabel(fee), 'Taxa municipal');
  assert.equal(getPropertyFeeAmount(fee, 'USD'), 25);
});
