import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { isProperty, isReservation } from '../src/utils/apiValidation.ts';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

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

test('returns validated reservation records from the authenticated API', async () => {
  const originalFetch = globalThis.fetch;
  setReservationsResponse({ success: true, data: [reservation] });

  try {
    assert.deepEqual(await crcnBackendApi.getMyReservations('test-token'), [reservation]);
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
  let cleanup: (() => void) | undefined;
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
    cleanup = testingLibrary.cleanup;
    const { OwnerAccessAdminView } = await import('../src/components/OwnerAccessAdminView.tsx');
    render(React.createElement(OwnerAccessAdminView, { accessToken: 'test-token' }));
    const search = await screen.findByLabelText('Localizar cadastro na Stays');
    fireEvent.change(search, { target: { value: 'Maria' } });
    await waitFor(() => assert.ok(screen.getByRole('button', { name: /Maria da Silva/ })));
    assert.match(
      screen.getByRole('button', { name: /Maria da Silva/ }).textContent || '',
      /Quantidade de imóveis indisponível/,
    );
  } finally {
    cleanup?.();
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

    const quoteUpdate = {
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
      source: 'stays-live',
    };
    respond({
      success: true,
      status: 'checkout_pending',
      checkoutUrl: 'https://crcn.stays.net/checkout/abc',
      redirectUrl: 'https://crcn.stays.net/checkout/abc',
      quote: quoteUpdate,
    });
    const checkout = await crcnBackendApi.createCheckout(
      {
        listingId: 'JQ08G',
        from: '2026-10-13',
        to: '2026-10-15',
        guests: { adults: 1, children: 0, infants: 0, pets: 0 },
        quoteTotal: 850,
      },
      'test-token',
    );
    assert.equal(checkout?.success, true);
    assert.deepEqual(checkout?.quote, quoteUpdate);
    assert.equal(checkout?.quote && 'breakdown' in checkout.quote, false);

    respond(
      {
        success: false,
        code: 'quote_changed',
        message: 'O preço mudou.',
        quote: quoteUpdate,
      },
      409,
    );
    const changedQuote = await crcnBackendApi.createCheckout(
      {
        listingId: 'JQ08G',
        from: '2026-10-13',
        to: '2026-10-15',
        guests: { adults: 1, children: 0, infants: 0, pets: 0 },
        quoteTotal: 850,
      },
      'test-token',
    );
    assert.equal(changedQuote?.success, false);
    if (changedQuote?.success === false) {
      assert.deepEqual(changedQuote.quote, quoteUpdate);
      assert.equal(changedQuote.quote && 'breakdown' in changedQuote.quote, false);
    }

    respond({
      success: true,
      status: 'checkout_pending',
      checkoutUrl: 'https://example.test/checkout',
      redirectUrl: 'https://example.test/checkout',
      quote: quoteUpdate,
    });
    assert.equal(
      await crcnBackendApi.createCheckout(
        {
          listingId: 'JQ08G',
          from: '2026-10-13',
          to: '2026-10-15',
          guests: { adults: 1, children: 0, infants: 0, pets: 0 },
          quoteTotal: 850,
        },
        'test-token',
      ),
      null,
    );

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

test('checkout rejects quotes for another listing or stay length', async () => {
  const originalFetch = globalThis.fetch;
  const payload = {
    listingId: 'JQ08G',
    from: '2026-10-13',
    to: '2026-10-15',
    guests: { adults: 1, children: 0, infants: 0, pets: 0 },
    quoteTotal: 850,
  };
  const quote = {
    listingId: 'property-internal-id',
    staysListingId: 'OTHER',
    nights: 2,
    dailyRate: 350,
    baseTotal: 700,
    cleaningFee: 150,
    serviceFee: 0,
    discount: 0,
    total: 850,
    currency: 'BRL',
    source: 'stays-live',
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        status: 'checkout_pending',
        checkoutUrl: 'https://crcn.stays.net/checkout/abc',
        redirectUrl: 'https://crcn.stays.net/checkout/abc',
        quote,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    assert.equal(await crcnBackendApi.createCheckout(payload, 'test-token'), null);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          status: 'checkout_pending',
          checkoutUrl: 'https://crcn.stays.net/checkout/abc',
          redirectUrl: 'https://crcn.stays.net/checkout/abc',
          quote: { ...quote, staysListingId: 'JQ08G', nights: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    assert.equal(await crcnBackendApi.createCheckout(payload, 'test-token'), null);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          status: 'checkout_pending',
          checkoutUrl: 'https://crcn.stays.net/checkout/abc',
          redirectUrl: 'https://crcn.stays.net/checkout/abc',
          quote: { ...quote, staysListingId: 'JQ08G', nights: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const validMappedQuote = await crcnBackendApi.createCheckout(payload, 'test-token');
    assert.equal(validMappedQuote?.success, true);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          code: 'quote_changed',
          quote: { ...quote, staysListingId: 'OTHER' },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    assert.equal(await crcnBackendApi.createCheckout(payload, 'test-token'), null);
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
