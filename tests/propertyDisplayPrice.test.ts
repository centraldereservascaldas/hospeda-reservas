import assert from 'node:assert/strict';
import test from 'node:test';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { getPropertyDisplayPrice } from '../src/utils/propertyDisplayPrice.ts';
import { formatCurrency } from '../src/utils/formatters.ts';

const property = STAYS_NET_APARTMENTS[0]!;
const quotedProperty = {
  ...property,
  calculatedPrice: {
    nights: 2,
    dailyRate: 250,
    basePrice: 500,
    cleaningFee: 50,
    serviceFee: 0,
    totalAmount: 550,
    currency: 'BRL',
  },
};

test('uses the confirmed nightly or total quote for selected search dates', () => {
  assert.deepEqual(getPropertyDisplayPrice(quotedProperty, true, false), {
    kind: 'quote',
    amount: 250,
    detail: '/ noite',
  });
  assert.deepEqual(getPropertyDisplayPrice(quotedProperty, true, true), {
    kind: 'quote',
    amount: 550,
    detail: 'Total da estadia • 2 noites',
    dailyRate: 250,
  });
});

test('does not show a base price as a quote when search dates have no confirmed price', () => {
  const withoutQuote = { ...property, calculatedPrice: undefined };

  assert.deepEqual(getPropertyDisplayPrice(withoutQuote, true, false), {
    kind: 'pending',
    message: 'Preço ainda não confirmado para esse período',
  });
});

test('uses the reference rate only when there are no dates or stored quote', () => {
  const withoutQuote = { ...property, calculatedPrice: undefined, pricePerNight: 245 };

  assert.deepEqual(getPropertyDisplayPrice(withoutQuote, false, false), {
    kind: 'reference',
    amount: 245,
    detail: '/ noite',
    note: 'Tarifa de referência; total depende das datas',
  });
});

test('requires a fresh date selection before showing a previously calculated quote', () => {
  assert.deepEqual(getPropertyDisplayPrice(quotedProperty, false, true), {
    kind: 'select-dates',
    message: 'Selecione as datas para consultar o preço atualizado',
  });
});

test('marks converted display currencies as approximate while keeping BRL exact', () => {
  assert.doesNotMatch(formatCurrency(100, 'BRL'), /≈/);
  assert.match(formatCurrency(100, 'USD'), /^≈\s/);
  assert.match(formatCurrency(100, 'EUR'), /^≈\s/);
});
