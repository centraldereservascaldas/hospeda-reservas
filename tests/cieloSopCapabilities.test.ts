import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutApi } from '../src/services/checkoutApi.ts';

const reference = '1234567890123456789012345678901234567890';
const resumeToken = 'a'.repeat(64);

for (const [label, fields, expected] of [
  ['old backend', {}, 'ready'],
  [
    'explicit pilot',
    { singlePageCheckoutEnabled: true, parkTicketsPreviewEnabled: false },
    'ready',
  ],
  [
    'preview requires pilot',
    { singlePageCheckoutEnabled: false, parkTicketsPreviewEnabled: true },
    'unavailable',
  ],
  ['invalid UI flag', { singlePageCheckoutEnabled: 'true' }, 'unavailable'],
  ['invalid preview flag', { parkTicketsPreviewEnabled: 1 }, 'unavailable'],
] as const) {
  test(`readiness validates independent entry flags: ${label}`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          ready: true,
          checkoutEnabled: true,
          termsAvailable: true,
          payment: { enabled: true, methods: ['card'], publicKey: null, provider: 'cielo' },
          ...fields,
        }),
        { status: 200 },
      );
    try {
      const result = await checkoutApi.getCheckoutReadiness('JQ08G');
      assert.equal(result.kind, expected);
      if (label === 'old backend' && result.kind === 'ready')
        assert.notEqual(result.data.singlePageCheckoutEnabled, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
const order = {
  id: '90c0a1c0-27aa-4a23-8a63-d750de9f183e',
  status: 'pre_reservado',
  publicReference: reference,
  reservationStatus: 'reserved',
  reservationConfirmed: false,
  listingId: 'JQ08G',
  guestName: 'Checkout Guest',
  from: '2026-10-13',
  to: '2026-10-15',
  quoteTotal: '850.00',
  currency: 'BRL',
  paymentStatus: null,
  expiresAt: '2026-10-13T12:30:00.000Z',
  createdAt: '2026-10-13T12:00:00.000Z',
};

const readResumeWithCapabilities = async (payment: Record<string, unknown>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, order, confirmation: null, payment }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    return await checkoutApi.resumeCheckout(reference, resumeToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

for (const environment of ['sandbox', 'production', 'invalid']) {
  test(`SOP token response accepts only supported environments: ${environment}`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ success: true, environment, accessToken: 'browser-token-fixture' }),
        { status: 200 },
      );
    try {
      const result = await checkoutApi.getCieloSopAccessToken(reference, {
        type: 'resume-token',
        resumeToken,
      });
      if (environment === 'invalid') assert.equal(result, null);
      else assert.equal(result?.environment, environment);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test('resume preserves Cielo card capability without a Mercado Pago public key', async () => {
  const result = await readResumeWithCapabilities({
    enabled: true,
    methods: ['card'],
    publicKey: null,
    provider: 'cielo_sandbox',
  });

  assert.equal(result.kind, 'ready');
  if (result.kind === 'ready') {
    assert.deepEqual(result.data.payment, {
      enabled: true,
      methods: ['card'],
      publicKey: null,
      provider: 'cielo_sandbox',
    });
  }
});

test('resume preserves Mercado Pago card capability and its public key', async () => {
  const result = await readResumeWithCapabilities({
    enabled: true,
    methods: ['pix', 'card'],
    publicKey: 'mp-public-key-sentinel',
    provider: 'mercadopago',
  });

  assert.equal(result.kind, 'ready');
  if (result.kind === 'ready') {
    assert.equal(result.data.payment.provider, 'mercadopago');
    assert.equal(result.data.payment.publicKey, 'mp-public-key-sentinel');
    assert.deepEqual(result.data.payment.methods, ['pix', 'card']);
  }
});

test('resume recognizes the production direct Cielo provider independently from sandbox', async () => {
  const result = await readResumeWithCapabilities({
    enabled: true,
    methods: ['card'],
    publicKey: null,
    provider: 'cielo',
  });
  assert.equal(result.kind, 'ready');
  if (result.kind === 'ready') assert.equal(result.data.payment.provider, 'cielo');
});

test('legacy payment capability without a provider fails closed', async () => {
  const result = await readResumeWithCapabilities({
    enabled: false,
    methods: [],
    publicKey: null,
  });

  assert.deepEqual(result, { kind: 'unavailable' });
});

test('payment capability with an unknown provider fails closed', async () => {
  const result = await readResumeWithCapabilities({
    enabled: true,
    methods: ['card'],
    publicKey: null,
    provider: 'unknown_gateway',
  });

  assert.deepEqual(result, { kind: 'unavailable' });
});
