import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { checkoutApi } from '../src/services/checkoutApi.ts';
import { isProperty, isReservation } from '../src/utils/apiValidation.ts';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { saveMeasurementConsent } from '../src/utils/measurementConsent.ts';
import { updateMeasurementAttribution } from '../src/utils/measurementAttribution.ts';

const reservation = {
  id: 'reservation-1',
  code: 'reservation-1',
  propertyId: 'JQ08G',
  propertyTitle: 'Lacqua DiRoma IV',
  propertyLocation: 'Caldas Novas',
  propertyImage: 'https://example.test/property.jpg',
  checkIn: '2026-10-13',
  checkOut: '2026-10-15',
  nights: 2,
  guests: { adults: 1, children: 0, infants: 0, pets: 0 },
  pricePerNight: 350,
  cleaningFee: 150,
  serviceFee: 0,
  discount: 0,
  totalAmount: 850,
  paymentMethod: 'pix',
  status: 'confirmed',
  createdAt: '2026-10-01T12:00:00Z',
  hostName: 'Central de Reservas Caldas Novas',
  guestName: 'Hóspede',
  guestEmail: 'guest@example.test',
  guestPhone: '',
  staysReservationId: 'reservation-1',
  staysSyncStatus: 'synced',
};

const setReservationsResponse = (payload: unknown) => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
};

const directCheckoutRequest = {
  listingId: 'JQ08G',
  from: '2026-10-13',
  to: '2026-10-15',
  guests: { adults: 1, children: 0, infants: 0, pets: 0 },
  quoteTotal: 850,
  guest: { fullName: 'Checkout Guest', email: 'checkout@example.test', phone: '+5511999999999' },
  acceptedTermsVersion: 'terms-2026-01',
  acceptedTerms: true as const,
  idempotencyKey: 'checkout-attempt-00001',
};

const directCheckoutOrder = {
  status: 'pre_reservado',
  publicReference: '1234567890123456789012345678901234567890',
  reservationConfirmed: false,
  reservationStatus: 'reserved',
  listingId: 'JQ08G',
  guestName: 'Checkout Guest',
  from: '2026-10-13',
  to: '2026-10-15',
  quoteTotal: '850.00',
  currency: 'BRL',
  paymentStatus: null,
  expiresAt: '2026-10-13T12:30:00.000000Z',
  createdAt: '2026-10-13T12:00:00.000000Z',
};

const directCheckoutResume = {
  reference: directCheckoutOrder.publicReference,
  token: 'a'.repeat(64),
  path: `/checkout/${directCheckoutOrder.publicReference}`,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

test('returns validated reservation records from the authenticated API', async () => {
  const originalFetch = globalThis.fetch;
  setReservationsResponse({ success: true, data: [reservation] });

  try {
    assert.deepEqual(await crcnBackendApi.getMyReservations('test-token'), [reservation]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('accepts a pending reservation without inventing its payment method', () => {
  assert.equal(isReservation({ ...reservation, status: 'pending', paymentMethod: '' }), true);
});

test('clears unsafe accommodation image URLs in authenticated reservations', async () => {
  const originalFetch = globalThis.fetch;
  setReservationsResponse({
    success: true,
    data: [
      { ...reservation, propertyImage: 'javascript:alert(1)' },
      { ...reservation, id: 'reservation-2', propertyImage: 'https://example.test/safe.jpg' },
    ],
  });

  try {
    const reservations = await crcnBackendApi.getMyReservations('test-token');
    assert.deepEqual(
      reservations.map((item) => item.propertyImage),
      ['', 'https://example.test/safe.jpg'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects malformed reservation data instead of casting it to the UI type', async () => {
  const originalFetch = globalThis.fetch;
  setReservationsResponse({
    success: true,
    data: [{ ...reservation, checkIn: '2026-02-30' }],
  });

  try {
    await assert.rejects(
      crcnBackendApi.getMyReservations('test-token'),
      /dados inválidos para reservas/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reservation validation rejects date-night mismatches and negative amounts', () => {
  assert.equal(isReservation({ ...reservation, nights: 3 }), false);
  assert.equal(isReservation({ ...reservation, totalAmount: -850 }), false);
  assert.equal(isReservation({ ...reservation, pricePerNight: -350 }), false);
  assert.equal(isReservation(reservation), true);
});

test('property validation enforces semantic title, rating, and coordinate bounds', () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  assert.equal(isProperty(property), true);
  assert.equal(
    isProperty({
      ...property,
      calculatedPrice: { ...property.calculatedPrice, nights: 0 },
    }),
    false,
  );
  assert.equal(
    isProperty({
      ...property,
      calculatedPrice: { ...property.calculatedPrice, nights: 1.5 },
    }),
    false,
  );
  assert.equal(isProperty({ ...property, title: '  ' }), false);
  assert.equal(isProperty({ ...property, rating: 5.1 }), false);
  assert.equal(isProperty({ ...property, location: { ...property.location, lat: 91 } }), false);
  assert.equal(isProperty({ ...property, location: { ...property.location, lng: -181 } }), false);
  const review = {
    id: 'review-1',
    authorName: 'Hóspede',
    rating: 5,
    date: '2026-10-01',
    comment: '',
    categories: { cleanliness: 5 },
  };
  assert.equal(isProperty({ ...property, reviews: [{ ...review, rating: 5.1 }] }), false);
  assert.equal(
    isProperty({ ...property, reviews: [{ ...review, categories: { cleanliness: 5.1 } }] }),
    false,
  );
});

test('property validation rejects malformed optional metadata and review enums', () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const review = {
    id: 'review-1',
    authorName: 'Hóspede',
    rating: 5,
    date: '2026-10-01',
    comment: '',
    categories: {},
  };
  const invalidProperties = [
    { ...property, complexName: 42 },
    { ...property, complexDescription: false },
    { ...property, staysSynced: 'true' },
    { ...property, reviewsSynced: 1 },
    { ...property, reviews: [{ ...review, authorAvatar: 42 }] },
    { ...property, reviews: [{ ...review, source: 'unknown-channel' }] },
    { ...property, reviews: [{ ...review, publicationStatus: 'pending' }] },
  ];

  for (const invalidProperty of invalidProperties) {
    assert.equal(isProperty(invalidProperty), false);
  }
  assert.equal(
    isProperty({
      ...property,
      reviews: [{ ...review, source: 'airbnb', publicationStatus: 'published' }],
    }),
    true,
  );
});

test('validates owner access status values returned by the authenticated API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, status: 'administrator' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    await assert.rejects(crcnBackendApi.getOwnerAccess('test-token'), /status inválido/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects malformed owner access request records', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        requests: [
          { userId: 'user-1', fullName: 'Hóspede', email: 'guest@example.test', requestedAt: 123 },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );

  try {
    await assert.rejects(
      crcnBackendApi.getOwnerAccessRequests('test-token'),
      /dados inválidos para as solicitações/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('accepts Stays owner summaries when the Laravel contract omits propertyCount', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        owners: [{ id: 'owner-1', name: 'Maria da Silva' }],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );

  try {
    assert.deepEqual(await crcnBackendApi.searchStaysOwners('test-token', 'Maria'), [
      { id: 'owner-1', name: 'Maria da Silva' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shows an explicit fallback when an owner summary has no property count', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const originalGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    getComputedStyle: globalThis.getComputedStyle,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle,
  });

  const originalGetRequests = crcnBackendApi.getOwnerAccessRequests;
  const originalSearchStaysOwners = crcnBackendApi.searchStaysOwners;
  let cleanup: (() => Promise<void>) | undefined;
  crcnBackendApi.getOwnerAccessRequests = async () => [
    {
      userId: 'user-1',
      fullName: 'Hóspede',
      email: 'guest@example.test',
      requestedAt: '2026-10-13T12:00:00Z',
    },
  ];
  crcnBackendApi.searchStaysOwners = async () => [{ id: 'owner-1', name: 'Maria da Silva' }];

  try {
    const React = (await import('react')).default;
    const testingLibrary = await import('@testing-library/react');
    const { render, screen, waitFor, fireEvent } = testingLibrary;
    cleanup = async () => {
      await testingLibrary.act(async () => {
        testingLibrary.cleanup();
      });
    };
    const { OwnerAccessAdminView } =
      await import('../src/components/owner/OwnerAccessAdminView.tsx');
    render(React.createElement(OwnerAccessAdminView, { accessToken: 'test-token' }));
    const search = await screen.findByLabelText('Localizar cadastro na Stays');
    fireEvent.change(search, { target: { value: 'Maria' } });
    await waitFor(() => assert.ok(screen.getByRole('button', { name: /Maria da Silva/ })));
    assert.match(
      screen.getByRole('button', { name: /Maria da Silva/ }).textContent || '',
      /Quantidade de imóveis indisponível/,
    );
  } finally {
    await cleanup?.();
    crcnBackendApi.getOwnerAccessRequests = originalGetRequests;
    crcnBackendApi.searchStaysOwners = originalSearchStaysOwners;
    Object.assign(globalThis, originalGlobals);
    dom.window.close();
  }
});

test('validates the remaining backend response boundaries', async () => {
  const originalFetch = globalThis.fetch;
  const respond = (payload: unknown, status = 200) => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
  };

  try {
    respond({ success: true, staysSynced: false });
    assert.equal(await crcnBackendApi.syncStaysGuest('test-token'), null);

    respond({
      success: true,
      code: 'pre_reserved',
      message: 'Pré-reserva registrada.',
      order: directCheckoutOrder,
      resume: directCheckoutResume,
      payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
      idempotentReplay: false,
    });
    const checkout = await checkoutApi.createCheckout(directCheckoutRequest);
    assert.equal(checkout?.success, true);
    assert.deepEqual(checkout?.order, directCheckoutOrder);
    assert.deepEqual(checkout?.resume, directCheckoutResume);
    assert.deepEqual(checkout?.payment, {
      enabled: false,
      methods: [],
      publicKey: null,
      provider: 'mercadopago',
    });
    assert.equal(checkout?.idempotentReplay, false);

    respond(
      {
        success: false,
        code: 'quote_changed',
        message: 'O preço mudou.',
        payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
        idempotentReplay: false,
      },
      409,
    );
    const changedQuote = await checkoutApi.createCheckout(directCheckoutRequest);
    assert.equal(changedQuote?.success, false);

    respond({
      success: true,
      code: 'pre_reserved',
      order: directCheckoutOrder,
      resume: { ...directCheckoutResume, token: 'invalid' },
      payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
      idempotentReplay: false,
    });
    assert.equal(await checkoutApi.createCheckout(directCheckoutRequest), null);

    respond({ success: true, reservationId: 'different-reservation' });
    await assert.rejects(crcnBackendApi.cancelMyReservation('reservation-1', 'test-token'));

    respond({ success: true, isAdmin: 'true' });
    await assert.rejects(crcnBackendApi.getOwnerAdminStatus('test-token'));

    respond({ success: true, status: 'pending' });
    await assert.rejects(crcnBackendApi.approveOwnerAccess('test-token', 'user-1', 'owner-1'));

    respond({ connected: true, hasCredentials: true, totalProperties: '19' });
    assert.equal(await crcnBackendApi.getStaysStatus(), null);

    respond({ success: true, reply: 'Olá', matchedProperties: [{ id: 'malformed' }] });
    const sofia = await crcnBackendApi.chatWithSofia('Oi');
    assert.equal(sofia.success, false);
    assert.deepEqual(sofia.matchedProperties, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkout validates the created order and resumes it with a protected token', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          order: { ...directCheckoutOrder, listingId: 'OTHER' },
          resume: directCheckoutResume,
          payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
          idempotentReplay: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    assert.equal(await checkoutApi.createCheckout(directCheckoutRequest), null);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          order: { ...directCheckoutOrder, to: '2026-10-16' },
          resume: directCheckoutResume,
          payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
          idempotentReplay: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    assert.equal(await checkoutApi.createCheckout(directCheckoutRequest), null);

    let resumeHeader = '';
    globalThis.fetch = async (_input, init) => {
      resumeHeader = new Headers(init?.headers).get('X-Checkout-Resume-Token') ?? '';
      return new Response(
        JSON.stringify({
          success: true,
          order: directCheckoutOrder,
          confirmation: null,
          payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const resumed = await checkoutApi.resumeCheckout(
      directCheckoutResume.reference,
      directCheckoutResume.token,
    );
    assert.deepEqual(resumed, {
      kind: 'ready',
      data: {
        success: true,
        order: directCheckoutOrder,
        confirmation: null,
        payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
      },
    });
    assert.equal(resumeHeader, directCheckoutResume.token);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          order: { ...directCheckoutOrder, quoteTotal: '851.00' },
          payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    assert.deepEqual(
      await checkoutApi.resumeCheckout(directCheckoutResume.reference, directCheckoutResume.token),
      { kind: 'unavailable' },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkout sends only consented first and last touch attribution', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const originalGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const capturedRequest: { body?: Record<string, unknown> } = {};

  try {
    const consent = { analytics: true, advertising: false };
    const capturedAt = Date.now();
    updateMeasurementAttribution(
      consent,
      '?utm_source=google&utm_campaign=summer&gclid=must_not_send&email=guest%40example.test&utm_term=123456789',
      capturedAt,
    );
    saveMeasurementConsent(consent);
    globalThis.fetch = async (_input, init) => {
      capturedRequest.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          success: true,
          code: 'pre_reserved',
          order: directCheckoutOrder,
          resume: directCheckoutResume,
          payment: { enabled: false, methods: [], publicKey: null, provider: 'mercadopago' },
          idempotentReplay: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    assert.equal((await checkoutApi.createCheckout(directCheckoutRequest))?.success, true);
    assert.deepEqual(capturedRequest.body?.marketingAttribution, {
      firstTouch: {
        capturedAt,
        values: { utm_source: 'google', utm_campaign: 'summer' },
      },
      lastTouch: {
        capturedAt,
        values: { utm_source: 'google', utm_campaign: 'summer' },
      },
    });
    const serializedRequest = JSON.stringify(capturedRequest.body);
    assert.equal('version' in (capturedRequest.body?.marketingAttribution as object), false);
    assert.equal('expiresAt' in (capturedRequest.body?.marketingAttribution as object), false);
    assert.equal(serializedRequest.includes('must_not_send'), false);
    assert.equal(serializedRequest.includes('123456789'), false);
    assert.equal(serializedRequest.includes('guest@example.test'), false);

    saveMeasurementConsent({ analytics: false, advertising: false });
    await checkoutApi.createCheckout(directCheckoutRequest);
    assert.equal('marketingAttribution' in (capturedRequest.body ?? {}), false);
  } finally {
    globalThis.fetch = originalGlobals.fetch;
    Object.assign(globalThis, {
      window: originalGlobals.window,
      document: originalGlobals.document,
    });
    dom.window.close();
  }
});

test('creates a hosted Cielo checkout with the resume token and no card data', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit: Parameters<typeof fetch>[1];
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        code: 'pending',
        message: 'Checkout Cielo criado.',
        replayed: false,
        payment: {
          id: 'attempt-1',
          status: 'pending',
          method: 'card',
          amount: '125.00',
          currency: 'BRL',
          expiresAt: '2026-10-28T12:00:00Z',
          paidAt: null,
          checkoutUrl: 'https://cieloecommerce.cielo.com.br/checkout/example',
          pix: null,
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const result = await checkoutApi.createCieloCheckout(
      'A'.repeat(40),
      'B'.repeat(64),
      '125.00',
      'checkout-attempt-00001',
    );

    assert.equal(result.kind, 'response');
    if (result.kind === 'response') {
      assert.equal(result.success, true);
      assert.equal(
        result.payment?.checkoutUrl,
        'https://cieloecommerce.cielo.com.br/checkout/example',
      );
    }
    assert.equal(requestUrl, `/api/checkout/${'A'.repeat(40)}/cielo-checkout`);
    assert.equal(requestInit?.method, 'POST');
    const headers = new Headers(requestInit?.headers);
    assert.equal(headers.get('X-Checkout-Resume-Token'), 'B'.repeat(64));
    assert.equal(headers.get('Idempotency-Key'), 'checkout-attempt-00001');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      idempotencyKey: 'checkout-attempt-00001',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a hosted Cielo checkout URL from an untrusted host', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        code: 'pending',
        message: 'Checkout Cielo criado.',
        replayed: false,
        payment: {
          id: 'attempt-1',
          status: 'pending',
          method: 'card',
          amount: '125.00',
          currency: 'BRL',
          expiresAt: null,
          paidAt: null,
          checkoutUrl: 'https://attacker.example/checkout',
          pix: null,
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    const result = await checkoutApi.createCieloCheckout(
      'A'.repeat(40),
      'B'.repeat(64),
      '125.00',
      'checkout-attempt-00001',
    );

    assert.deepEqual(result, { kind: 'unavailable' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects invalid numeric and calendar values at API boundaries', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const payload = url.includes('/calendar')
      ? {
          data: [
            { date: '2026-02-30', avail: 1 },
            { date: '2026-10-14', avail: -1 },
          ],
        }
      : {
          success: true,
          listingId: 'JQ08G',
          nights: 2,
          dailyRate: -1,
          baseTotal: -2,
          cleaningFee: 0,
          serviceFee: 0,
          discount: 0,
          total: -2,
          currency: 'BRL',
          breakdown: {
            dailyRateText: 'R$ 0,00',
            cleaningFeeText: 'R$ 0,00',
            serviceFeeText: 'R$ 0,00',
            totalText: 'R$ 0,00',
          },
        };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    assert.equal(
      await crcnBackendApi.calculatePrice({
        listingId: 'JQ08G',
        from: '2026-10-13',
        to: '2026-10-15',
      }),
      null,
    );
    assert.deepEqual(await crcnBackendApi.getAccommodationCalendar('JQ08G'), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects malformed resort entries and invalid total counts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const payload = String(input).includes('/resorts')
      ? { success: true, data: [{ id: '', name: 'Resort' }] }
      : { total: -1, data: [] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    assert.deepEqual(await crcnBackendApi.getResorts(), []);
    const search = await crcnBackendApi.searchAccommodations({});
    assert.ok(search.total > 0);
    assert.ok(search.data.every((property) => typeof property.id === 'string'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects failed or malformed live catalogs instead of labeling bundled data as live', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    for (const response of [
      new Response('{"message":"Unavailable"}', { status: 500 }),
      new Response('{"source":"unknown","data":[]}', { status: 200 }),
      new Response('{"source":"stays-live","data":[{}]}', { status: 200 }),
    ]) {
      globalThis.fetch = async () => response.clone();
      await assert.rejects(crcnBackendApi.getAccommodations());
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('applies property, city and pagination filters to the undated search fallback', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = async () => new Response('Unavailable', { status: 500 });
  console.warn = () => undefined;
  try {
    const target = STAYS_NET_APARTMENTS[0]!;
    const result = await crcnBackendApi.searchAccommodations({
      propertyId: target.staysPropertyId,
      cities: [target.location.city],
      skip: 1,
      limit: 1,
    });
    const expected = STAYS_NET_APARTMENTS.filter(
      (property) =>
        property.staysPropertyId === target.staysPropertyId &&
        property.location.city.toLocaleLowerCase('pt-BR') ===
          target.location.city.toLocaleLowerCase('pt-BR'),
    );
    assert.equal(result.total, expected.length);
    assert.deepEqual(result.data, expected.slice(1, 2));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('dated search rejects results without the live availability source', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ total: 1, data: [STAYS_NET_APARTMENTS[0]], source: 'local-catalog' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  console.warn = () => undefined;

  try {
    await assert.rejects(
      crcnBackendApi.searchAccommodations({
        from: '2026-11-11',
        to: '2026-11-13',
        guests: 2,
      }),
      /A pesquisa retornou uma resposta inválida/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('dated search rejects availability confirmed for different dates or guest counts', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const requestedContext = { from: '2026-11-11', to: '2026-11-13', guests: 2 };
  const mismatchedResponses = [
    { from: '2026-11-12', to: requestedContext.to, guests: requestedContext.guests },
    { from: requestedContext.from, to: '2026-11-14', guests: requestedContext.guests },
    { from: requestedContext.from, to: requestedContext.to, guests: 3 },
  ];
  console.warn = () => undefined;

  try {
    for (const context of mismatchedResponses) {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            total: 1,
            ...context,
            data: [STAYS_NET_APARTMENTS[0]],
            source: 'stays-live',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      await assert.rejects(
        crcnBackendApi.searchAccommodations(requestedContext),
        /A pesquisa retornou uma resposta inválida/,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
