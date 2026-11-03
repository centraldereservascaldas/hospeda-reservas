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

test('a page performs one request and returns the raw continuation without filling quote gaps', async () => {
  const requests: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return response([property], {
      total: 999,
      unquotedCount: 2,
      pagination: { receivedCount: 12, nextSkip: 36, hasMore: true },
    });
  };
  const result = await crcnBackendApi.searchAccommodationsPage({ ...params, skip: 24 });
  assert.deepEqual(requests, [{ ...params, skip: 24, limit: 12 }]);
  assert.equal(result.total, 1);
  assert.equal(result.unquotedCount, 2);
  assert.deepEqual(result.pagination, { receivedCount: 12, nextSkip: 36, hasMore: true });
});

test('an unquoted page remains distinguishable from no availability and can continue', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response([], {
      unquotedCount: 12,
      pagination: { receivedCount: 12, nextSkip: 12, hasMore: true },
    });
  };
  const result = await crcnBackendApi.searchAccommodationsPage(params);
  assert.equal(calls, 1);
  assert.deepEqual(result.data, []);
  assert.equal(result.unquotedCount, 12);
  assert.equal(result.pagination.hasMore, true);
});

test('legacy responses continue by raw consumed records even if the client rejects a quote', async () => {
  globalThis.fetch = async () =>
    response([
      { ...property, calculatedPrice: { ...property.calculatedPrice, nights: 1 } },
      property,
      property,
    ]);
  const result = await crcnBackendApi.searchAccommodationsPage({ ...params, limit: 3, skip: 6 });
  assert.equal(result.total, 1);
  assert.equal(result.unquotedCount, 1);
  assert.deepEqual(result.pagination, { receivedCount: 3, nextSkip: 9, hasMore: true });
});

test('rejects invalid page bounds before issuing a request', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response([]);
  };
  for (const bounds of [{ limit: 0 }, { limit: 21 }, { limit: NaN }, { skip: -1 }, { skip: 0.5 }]) {
    await assert.rejects(
      crcnBackendApi.searchAccommodationsPage({ ...params, ...bounds }),
      /paginação/,
    );
  }
  assert.equal(calls, 0);
});

test('a cancelled page never issues a request or falls back to cached inventory', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response([]);
  };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(crcnBackendApi.searchAccommodationsPage({}, { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(calls, 0);
});

test('cancels an in-flight page and permits an independent retry', async () => {
  let requestSignal: AbortSignal | null = null;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      requestSignal = init?.signal as AbortSignal;
      requestSignal.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
    });
  const controller = new AbortController();
  const pending = crcnBackendApi.searchAccommodationsPage(params, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal((requestSignal as AbortSignal | null)?.aborted, true);
  globalThis.fetch = async () => response([property]);
  assert.equal((await crcnBackendApi.searchAccommodationsPage(params)).data.length, 1);
});

test('single-page HTTP failures propagate without a static availability fallback', async () => {
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(crcnBackendApi.searchAccommodationsPage(params), /HTTP 503/);
  await assert.rejects(crcnBackendApi.searchAccommodationsPage({}), /HTTP 503/);
});
