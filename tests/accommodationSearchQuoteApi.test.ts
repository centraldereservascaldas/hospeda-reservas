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
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let requestSignal: AbortSignal | null = null;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      requestSignal = init?.signal as AbortSignal;
      requestSignal.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      requestStarted();
    });
  const controller = new AbortController();
  const pending = crcnBackendApi.searchAccommodationsPage(params, { signal: controller.signal });
  await started;
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

test('shares equivalent pending pages while preserving the remaining HTTP consumer after cancellation', async () => {
  let finish!: (response: Response) => void;
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let calls = 0;
  let requestSignal: AbortSignal | null = null;
  globalThis.fetch = (_input, init) => {
    calls += 1;
    requestSignal = init?.signal as AbortSignal;
    requestStarted();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const controller = new AbortController();
  const first = crcnBackendApi.searchAccommodationsPage(
    { ...params, cities: ['Caldas Novas', 'Rio Quente'], skip: 0, limit: 12 },
    { signal: controller.signal },
  );
  const second = crcnBackendApi.searchAccommodationsPage({
    ...params,
    cities: ['Rio Quente', 'Caldas Novas', 'Rio Quente'],
  });
  await started;
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal((requestSignal as AbortSignal | null)?.aborted, false);
  finish(response([property]));
  assert.equal((await second).data.length, 1);
  assert.equal(calls, 1);
});

test('caps actual concurrent HTTP search pages at two', async () => {
  const pending: Array<() => void> = [];
  let live = 0;
  let maxLive = 0;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      pending.push(() => {
        live -= 1;
        resolve(response([property]));
      });
    });
  const a = crcnBackendApi.searchAccommodationsPage({ ...params, skip: 0 });
  const b = crcnBackendApi.searchAccommodationsPage({ ...params, skip: 12 });
  const c = crcnBackendApi.searchAccommodationsPage({ ...params, skip: 24 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[0]!();
  await a;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 3);
  pending[1]!();
  pending[2]!();
  await Promise.all([b, c]);
  assert.equal(maxLive, 2);
});

test('cancelling an undated aggregate stops its pages without returning a static fallback', async () => {
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let calls = 0;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      calls += 1;
      const signal = init?.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      requestStarted();
    });
  const controller = new AbortController();
  const pending = crcnBackendApi.searchAccommodations({}, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('preserves the server deadline of a reused search page', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date'], now });
  try {
    globalThis.fetch = async () =>
      response([property], {
        meta: {
          fetchedAt: new Date(now - 40_000).toISOString(),
          expiresAt: new Date(now + 5_000).toISOString(),
        },
      });
    const result = await crcnBackendApi.searchAccommodationsPage(params);
    assert.equal(result.expiresAt, now + 5_000);
    assert.equal(result.data[0]?.calculatedPrice?.expiresAt, now + 5_000);
  } finally {
    context.mock.timers.reset();
  }
});

test('rejects expired or malformed search validity instead of confirming cached prices', async () => {
  for (const meta of [
    { fetchedAt: 'invalid', expiresAt: 'invalid' },
    { fetchedAt: '2020-01-01T00:00:00Z', expiresAt: '2020-01-01T00:00:45Z' },
    { fetchedAt: '2099-01-01T00:00:45Z', expiresAt: '2099-01-01T00:00:00Z' },
  ]) {
    globalThis.fetch = async () => response([property], { meta });
    await assert.rejects(crcnBackendApi.searchAccommodationsPage(params), /validade|expirou/);
  }
});

for (const offset of [-3_600_000, 3_600_000]) {
  test(`uses remaining server validity with a device clock offset of ${offset}ms`, async (context) => {
    const serverNow = Date.UTC(2026, 10, 3);
    const deviceNow = serverNow + offset;
    context.mock.timers.enable({ apis: ['Date'], now: deviceNow });
    globalThis.fetch = async () => {
      const result = response([property], {
        meta: {
          fetchedAt: new Date(serverNow - 40_000).toISOString(),
          expiresAt: new Date(serverNow + 5_000).toISOString(),
        },
      });
      result.headers.set('Date', new Date(serverNow).toUTCString());
      return result;
    };
    try {
      const result = await crcnBackendApi.searchAccommodationsPage(params);
      assert.equal(result.data.length, 1);
      assert.ok(result.expiresAt! > deviceNow + 3000);
      assert.ok(result.expiresAt! <= deviceNow + 4000);
      assert.equal(result.data[0]?.calculatedPrice?.expiresAt, result.expiresAt);
    } finally {
      context.mock.timers.reset();
    }
  });
}

test('rejects a server-expired snapshot even on a slow device clock', async (context) => {
  const serverNow = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date'], now: serverNow - 3_600_000 });
  globalThis.fetch = async () => {
    const result = response([property], {
      meta: {
        fetchedAt: new Date(serverNow - 45_000).toISOString(),
        expiresAt: new Date(serverNow).toISOString(),
      },
    });
    result.headers.set('Date', new Date(serverNow).toUTCString());
    return result;
  };
  try {
    await assert.rejects(crcnBackendApi.searchAccommodationsPage(params), /expirou/);
  } finally {
    context.mock.timers.reset();
  }
});

test('renews a snapshot with one server second left without confirming the expired price', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const result = response([property], {
      meta:
        calls === 1
          ? {
              fetchedAt: new Date(now - 44_000).toISOString(),
              expiresAt: new Date(now + 1000).toISOString(),
            }
          : {
              fetchedAt: new Date(now + 1000).toISOString(),
              expiresAt: new Date(now + 46_000).toISOString(),
            },
    });
    result.headers.set('Date', new Date(now + (calls === 1 ? 0 : 1000)).toUTCString());
    return result;
  };
  try {
    let settled = false;
    const pending = crcnBackendApi.searchAccommodationsPage(params).then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(settled, false);
    context.mock.timers.tick(1000);
    const result = await pending;
    assert.equal(calls, 2);
    assert.equal(result.data.length, 1);
    assert.ok(result.expiresAt! > now + 44_000);
  } finally {
    context.mock.timers.reset();
  }
});

test('does not loop when the repeated server snapshot is still expired', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const result = response([property], {
      meta: { fetchedAt: '2026-11-03T00:00:00Z', expiresAt: '2026-11-03T00:00:45Z' },
    });
    result.headers.set('Date', 'Tue, 03 Nov 2026 00:00:45 GMT');
    return result;
  };
  await assert.rejects(crcnBackendApi.searchAccommodationsPage(params), /expirou/);
  assert.equal(calls, 2);
});

test('cancels an expiry retry before another network request', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const result = response([property], {
      meta: {
        fetchedAt: new Date(now - 44_000).toISOString(),
        expiresAt: new Date(now + 1000).toISOString(),
      },
    });
    result.headers.set('Date', new Date(now).toUTCString());
    return result;
  };
  const controller = new AbortController();
  try {
    const pending = crcnBackendApi.searchAccommodationsPage(params, { signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await rejected;
    context.mock.timers.tick(2000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
  } finally {
    context.mock.timers.reset();
  }
});

test('bounds the expired-snapshot wait even after a slow round trip', async (context) => {
  const now = Date.UTC(2026, 10, 3);
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  let clockCalls = 0;
  context.mock.method(performance, 'now', () => (clockCalls++ === 0 ? 0 : 5000));
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const result = response([property], {
      meta: {
        fetchedAt: new Date(now - (calls === 1 ? 41_000 : 0)).toISOString(),
        expiresAt: new Date(now + (calls === 1 ? 4000 : 45_000)).toISOString(),
      },
    });
    result.headers.set('Date', new Date(now).toUTCString());
    return result;
  };
  try {
    const pending = crcnBackendApi.searchAccommodationsPage(params);
    await new Promise((resolve) => setImmediate(resolve));
    context.mock.timers.tick(1999);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    context.mock.timers.tick(1);
    const result = await pending;
    assert.equal(calls, 2);
    assert.equal(result.data.length, 1);
  } finally {
    context.mock.timers.reset();
  }
});
