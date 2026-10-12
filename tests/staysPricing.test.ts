import test from 'node:test';
import assert from 'node:assert/strict';
import { hasQuoteChanged, normalizeStaysQuote } from '../src/utils/staysPricing.ts';

const fee = (name: string, amount: number) => ({
  internalName: name,
  _mstitle: { pt_BR: name },
  _mcval: { BRL: amount },
});

test('includes counter/other fees in the nightly rate without listing them separately', () => {
  const quote = normalizeStaysQuote({
    _mctotal: { BRL: 3001 },
    feesIncluded: true,
    fees: [fee('Taxa de limpeza', 130), fee('Tarifa balcão', 957)],
  }, 2);

  assert.equal(quote?.dailyRate, 1500.5);
  assert.equal(quote?.total, 3001);
  assert.equal(quote?.cleaningFee, 130);
  assert.equal(quote?.cleaningIncluded, true);
  assert.equal(quote?.fees.length, 1);
  assert.match(quote?.fees[0].internalName || '', /limpeza/i);
});

test('keeps cleaning separate and incorporates other fees when fees are not included', () => {
  const quote = normalizeStaysQuote({
    _mctotal: { BRL: 1914 },
    feesIncluded: false,
    fees: [fee('Cleaning fee', 130), fee('Counter rate', 957)],
  }, 2);

  assert.equal(quote?.dailyRate, 1435.5);
  assert.equal(quote?.total, 3001);
  assert.equal(quote?.cleaningIncluded, false);
  assert.equal(quote?.fees.length, 1);
});

test('returns null for missing/invalid PMS prices', () => {
  assert.equal(normalizeStaysQuote(null, 2), null);
  assert.equal(normalizeStaysQuote({ message: 'listing unavailable' }, 2), null);
  assert.equal(normalizeStaysQuote({ _mctotal: { BRL: 0 } }, 2), null);
  assert.equal(normalizeStaysQuote({ _mctotal: { BRL: 100 } }, 0), null);
  assert.equal(normalizeStaysQuote({ _mctotal: { BRL: 100 } }, 2), null);
});

test('ignores malformed fee records and amounts while keeping valid quote totals', () => {
  const quote = normalizeStaysQuote({
    _mctotal: { BRL: 1000 },
    feesIncluded: false,
    fees: [null, 'invalid', { internalName: 'Cleaning', _mcval: { BRL: 'invalid' } }, fee('Cleaning fee', 80)],
  }, 2);

  assert.equal(quote?.total, 1080);
  assert.equal(quote?.cleaningFee, 80);
  assert.equal(quote?.dailyRate, 500);
  assert.equal(quote?.fees.length, 1);
});

test('requires reconfirmation whenever the PMS quote changes by one cent or more', () => {
  assert.equal(hasQuoteChanged(3001, 3001), false);
  assert.equal(hasQuoteChanged(3001, 3001.01), true);
  assert.equal(hasQuoteChanged(3001, 3001.02), true);
  assert.equal(hasQuoteChanged(Number.NaN, 3001), true);
});
