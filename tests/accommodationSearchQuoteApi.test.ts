import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const params = { from: '2027-01-10', to: '2027-01-13', guests: 2 };
const property = {
  ...STAYS_NET_APARTMENTS[0]!,
  calculatedPrice: {
    nights: 3,
    dailyRate: 250,
    basePrice: 750,
    cleaningFee: 0,
    serviceFee: 0,
    totalAmount: 750,
    currency: 'BRL',
  },
};
const response = (data: unknown[], extra = {}) =>
  new Response(
    JSON.stringify({
      success: true,
      source: 'stays-live',
      ...params,
      total: data.length,
      data,
      ...extra,
    }),
    { status: 200 },
  );

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

test('returns only priced results and preserves the partial quote warning', async () => {
  globalThis.fetch = async () =>
    response([property], {
      unquotedCount: 1,
      pagination: { receivedCount: 2, nextSkip: 2, hasMore: false },
    });
  const result = await crcnBackendApi.searchAccommodations(params);
  assert.equal(result.data.length, 1);
  assert.equal(result.unquotedCount, 1);
});

test('advances pagination by consumed upstream records when a quote is missing', async () => {
  const offsets: number[] = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    offsets.push(payload.skip);
    return offsets.length === 1
      ? response([property], {
          unquotedCount: 1,
          pagination: { receivedCount: 2, nextSkip: 22, hasMore: true },
        })
      : response([{ ...property, id: 'second' }], {
          pagination: { receivedCount: 1, nextSkip: 23, hasMore: false },
        });
  };
  const result = await crcnBackendApi.searchAccommodations({ ...params, limit: 2, skip: 20 });
  assert.deepEqual(offsets, [20, 22]);
  assert.equal(result.data.length, 2);
});

test('reports an all-unquoted search as an error instead of no availability', async () => {
  console.warn = () => {};
  globalThis.fetch = async () =>
    response([], {
      unquotedCount: 1,
      pagination: { receivedCount: 1, nextSkip: 1, hasMore: false },
    });
  await assert.rejects(crcnBackendApi.searchAccommodations(params), /confirmar os preços/);
});

test('does not display an older backend result without a quote for the requested nights', async () => {
  console.warn = () => {};
  globalThis.fetch = async () =>
    response([{ ...property, calculatedPrice: { ...property.calculatedPrice, nights: 2 } }]);
  await assert.rejects(crcnBackendApi.searchAccommodations(params), /confirmar os preços/);
});

test('rejects pagination that would reuse a consumed offset', async () => {
  console.warn = () => {};
  globalThis.fetch = async () =>
    response([property], { pagination: { receivedCount: 1, nextSkip: 0, hasMore: true } });
  await assert.rejects(crcnBackendApi.searchAccommodations(params), /paginação/);
});
