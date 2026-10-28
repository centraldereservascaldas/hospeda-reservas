import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { CalculatedPriceResponse } from '../src/services/crcnBackendApi.ts';
import { calculatePropertyPricing } from '../src/utils/propertyPricing.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { cleanup, render, screen } = await import('@testing-library/react');
const { PropertyPriceBreakdown } =
  await import('../src/components/property/PropertyPriceBreakdown.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const createQuote = (discount: number): CalculatedPriceResponse => ({
  success: true,
  listingId: 'listing-1',
  nights: 2,
  dailyRate: 350,
  baseTotal: 700,
  cleaningFee: 150,
  serviceFee: 0,
  discount,
  total: 850 - discount,
  currency: 'BRL',
  source: 'stays-live',
  breakdown: {
    dailyRateText: 'R$ 350,00 x 2 noites',
    cleaningFeeText: 'Taxa de limpeza',
    serviceFeeText: 'Taxa de serviço',
    totalText: `R$ ${850 - discount},00`,
  },
});

test('shows a Stays discount as a deduction in the confirmed price breakdown', () => {
  const staysPrice = createQuote(50);
  const pricing = calculatePropertyPricing({
    nightlyRate: 350,
    cleaningFee: 150,
    serviceFeeRate: 0,
    nights: 2,
    quote: staysPrice,
  });

  render(
    React.createElement(PropertyPriceBreakdown, {
      property: { pricePerNight: 350 },
      currency: 'BRL',
      nights: 2,
      staysPrice,
      pricing,
    }),
  );

  const discountLabel = screen.getByText('Desconto');
  assert.match(discountLabel.parentElement?.textContent || '', /−.*50,00/);
  assert.match(screen.getByText('Total da estadia').parentElement?.textContent || '', /800,00/);
});

test('omits the discount line when the confirmed quote has no discount', () => {
  const staysPrice = createQuote(0);
  const pricing = calculatePropertyPricing({
    nightlyRate: 350,
    cleaningFee: 150,
    serviceFeeRate: 0,
    nights: 2,
    quote: staysPrice,
  });

  render(
    React.createElement(PropertyPriceBreakdown, {
      property: { pricePerNight: 350 },
      currency: 'BRL',
      nights: 2,
      staysPrice,
      pricing,
    }),
  );

  assert.equal(screen.queryByText('Desconto'), null);
});
