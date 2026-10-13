import assert from 'node:assert/strict';
import test from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';

const quote = {
  success: true,
  listingId: 'JQ08G',
  staysListingId: 'JQ08G',
  nights: 2,
  dailyRate: 350,
  baseTotal: 700,
  cleaningFee: 150,
  serviceFee: 0,
  discount: 0,
  total: 850,
  currency: 'BRL',
  feesIncluded: false,
  cleaningIncluded: false,
  fees: [],
  source: 'local-fallback',
  breakdown: {
    dailyRateText: 'R$ 350,00 x 2 noites',
    cleaningFeeText: 'Taxa de limpeza',
    serviceFeeText: 'Taxa de serviço',
    totalText: 'R$ 850,00',
  },
};

const setPriceResponse = (payload: unknown) => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
};

test('returns a fully validated calculated price response', async () => {
  const originalFetch = globalThis.fetch;
  setPriceResponse(quote);

  try {
    assert.deepEqual(
      await crcnBackendApi.calculatePrice({
        listingId: 'JQ08G',
        from: '2026-10-13',
        to: '2026-10-15',
        guests: 1,
      }),
      quote,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects incomplete calculated price responses', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  setPriceResponse({ ...quote, total: '850' });
  console.warn = () => undefined;

  try {
    assert.equal(
      await crcnBackendApi.calculatePrice({
        listingId: 'JQ08G',
        from: '2026-10-13',
        to: '2026-10-15',
        guests: 1,
      }),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
