import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const property = {
  ...STAYS_NET_APARTMENTS[0]!,
  calculatedPrice: {
    nights: 2,
    dailyRate: 250,
    basePrice: 500,
    cleaningFee: 0,
    serviceFee: 0,
    totalAmount: 500,
    currency: 'BRL',
  },
};
const dates = { from: '2027-02-05', to: '2027-02-07', guests: 2 };
function searchResponse(params: Record<string, unknown>, unquotedCount = 0) {
  const now = Date.now();
  return new Response(
    JSON.stringify({
      success: true,
      source: 'stays-live',
      ...params,
      total: 1,
      data: [property],
      unquotedCount,
      pagination: { receivedCount: 1, nextSkip: 1, hasMore: false },
      meta: {
        fetchedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 45000).toISOString(),
      },
    }),
    { status: 200 },
  );
}

test('reuses a fresh discovery page without extending its deadline or sharing mutable data', async () => {
  const params = { ...dates, purpose: 'discovery' as const, destination: 'reuse-proof' };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return searchResponse(params);
  };
  const first = await crcnBackendApi.searchAccommodationsPage(params);
  const deadline = first.data[0]!.calculatedPrice!.expiresAt;
  first.data[0]!.title = 'mutated';
  const second = await crcnBackendApi.searchAccommodationsPage(params);
  assert.equal(calls, 1);
  assert.notEqual(second.data[0]!.title, 'mutated');
  assert.equal(second.data[0]!.calculatedPrice!.expiresAt, deadline);
  await crcnBackendApi.searchAccommodationsPage({ ...params, purpose: undefined });
  assert.equal(calls, 2);
});

test('fetches again after discovery validity expires and separates occupancy', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 26, 12) });
  const params = { ...dates, purpose: 'discovery' as const, destination: 'expiry-proof' };
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    return searchResponse(JSON.parse(String(init?.body)));
  };
  try {
    await crcnBackendApi.searchAccommodationsPage(params);
    await crcnBackendApi.searchAccommodationsPage({ ...params, guests: 3 });
    assert.equal(calls, 2);
    context.mock.timers.tick(45001);
    await crcnBackendApi.searchAccommodationsPage(params);
    assert.equal(calls, 3);
  } finally {
    context.mock.timers.reset();
  }
});

test('does not cache partial discovery responses or failures', async () => {
  const params = { ...dates, purpose: 'discovery' as const, destination: 'partial-proof' };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new Error('offline');
    return searchResponse(params, 1);
  };
  await assert.rejects(crcnBackendApi.searchAccommodationsPage(params));
  await crcnBackendApi.searchAccommodationsPage(params);
  await crcnBackendApi.searchAccommodationsPage(params);
  assert.equal(calls, 3);
});

test('shares catalog requests and fresh descriptive data while allowing explicit refresh', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ source: 'stays-live', data: [property] }));
  };
  const [first, second] = await Promise.all([
    crcnBackendApi.getAccommodations(),
    crcnBackendApi.getAccommodations(),
  ]);
  assert.equal(calls, 1);
  first[0]!.title = 'mutated';
  assert.notEqual(second[0]!.title, 'mutated');
  await crcnBackendApi.getAccommodations({ reuseFresh: true });
  assert.equal(calls, 1);
  await crcnBackendApi.getAccommodations();
  assert.equal(calls, 2);
});
