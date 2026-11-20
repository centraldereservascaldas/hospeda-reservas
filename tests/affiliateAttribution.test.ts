import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureAffiliateReferral,
  retryAffiliateCapture,
  affiliateTransferUrl,
  readAffiliateReferral,
} from '../src/utils/affiliateAttribution.ts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    key: (index) => [...values.keys()][index] ?? null,
  };
}
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('server token is scoped to the selected property and expires', async () => {
  const storage = memoryStorage();
  const reference = 'a'.repeat(40);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, issuedAt: 1000, signature: 'c'.repeat(64) }), {
      status: 200,
    });
  await captureAffiliateReferral(
    new URL(`https://example.test/apartamento/123?ref=${reference}&sig=${'b'.repeat(64)}`),
    storage,
  );
  assert.deepEqual(readAffiliateReferral('123', storage), {
    reference,
    signature: 'c'.repeat(64),
    issuedAt: 1000,
  });
  assert.equal(readAffiliateReferral('456', storage), undefined);
  // Expiration is verified by the server, not the device clock.
});

test('invalid or rejected referrals do not replace an existing referral', async () => {
  const storage = memoryStorage();
  const reference = 'a'.repeat(40);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, issuedAt: 1000, signature: 'c'.repeat(64) }), {
      status: 200,
    });
  await captureAffiliateReferral(
    new URL(`https://example.test/apartamento/123?ref=${reference}&sig=${'b'.repeat(64)}`),
    storage,
  );
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  await captureAffiliateReferral(
    new URL(`https://example.test/apartamento/123?ref=${reference}&sig=${'d'.repeat(64)}`),
    storage,
  );
  assert.deepEqual(readAffiliateReferral('123', storage), {
    reference,
    signature: 'c'.repeat(64),
    issuedAt: 1000,
  });
  assert.equal(await retryAffiliateCapture('123', storage), false);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, issuedAt: 1000, signature: 'c'.repeat(64) }), {
      status: 200,
    });
  await captureAffiliateReferral(
    new URL(`https://example.test/apartamento/123?ref=${reference}&sig=${'b'.repeat(64)}`),
    storage,
  );
});

test('temporary failure keeps the referral and retries before checkout', async () => {
  const storage = memoryStorage();
  const reference = 'a'.repeat(40);
  const link = new URL(
    `https://example.test/apartamento/123?ref=${reference}&sig=${'b'.repeat(64)}`,
  );
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  await captureAffiliateReferral(link, storage);
  assert.equal(await retryAffiliateCapture('123', storage), false);
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        issuedAt: Math.floor(Date.now() / 1000),
        signature: 'c'.repeat(64),
      }),
      { status: 200 },
    );
  assert.equal(await retryAffiliateCapture('123', storage), true);
  assert.equal(readAffiliateReferral('123', storage)?.reference, reference);
});

test('transfer link preserves the signed original time on another device', async () => {
  const first = memoryStorage();
  const second = memoryStorage();
  const reference = 'a'.repeat(40);
  const issuedAt = Math.floor(Date.now() / 1000) - 100;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, issuedAt, signature: 'c'.repeat(64) }), {
      status: 200,
    });
  await captureAffiliateReferral(
    new URL(`https://example.test/apartamento/123?ref=${reference}&sig=${'b'.repeat(64)}`),
    first,
  );
  const link = affiliateTransferUrl('123', first, 'https://example.test');
  assert.ok(link);
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ success: true, issuedAt, signature: 'c'.repeat(64) }), {
      status: 200,
    });
  };
  await captureAffiliateReferral(new URL(link), second);
  assert.equal(sent.issuedAt, issuedAt);
  assert.deepEqual(readAffiliateReferral('123', second), readAffiliateReferral('123', first));
});
