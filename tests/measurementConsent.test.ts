import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { DirectBookingOrderSummary } from '../src/services/checkoutApi';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
});

const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { MeasurementPreferences } = await import('../src/components/MeasurementPreferences.tsx');

const { loadGtmIfConsented, readMeasurementConsent, saveMeasurementConsent } =
  await import('../src/utils/measurementConsent.ts');
const { emitConfirmedPurchase, emitFunnelEvent, emitViewItemList } =
  await import('../src/utils/measurementEvents.ts');

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.head.innerHTML = '';
  delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
  delete (window as Window & { __crcnConsentModeDefaultSet?: boolean }).__crcnConsentModeDefaultSet;
});

test('defaults to no consent and persists refusal', () => {
  assert.equal(readMeasurementConsent(), null);
  saveMeasurementConsent({ analytics: false, advertising: false });
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
  assert.equal((window as Window & { dataLayer?: unknown[] }).dataLayer, undefined);
  assert.equal(loadGtmIfConsented(readMeasurementConsent()!, 'GTM-ABC123'), false);
  assert.equal(document.querySelector('script'), null);
});

test('requires both choices and valid GTM ID, then inserts a single script', () => {
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: false }, 'GTM-ABC123'), false);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'invalid'), false);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123'), true);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123'), true);
  assert.equal(document.querySelectorAll('#crcn-gtm-script').length, 1);
  assert.equal(
    document.querySelector<HTMLScriptElement>('#crcn-gtm-script')?.src,
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123',
  );

  const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer!;
  const gtagCommands = dataLayer.filter(
    (entry): entry is ArrayLike<unknown> =>
      typeof entry === 'object' && entry !== null && 'length' in entry,
  );
  assert.deepEqual(
    gtagCommands.map((entry) => [entry[0], entry[1], entry[2]]),
    [
      [
        'consent',
        'default',
        {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        },
      ],
      [
        'consent',
        'update',
        {
          analytics_storage: 'granted',
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
        },
      ],
    ],
  );
  assert.equal(dataLayer[0], gtagCommands[0]);
  assert.equal(dataLayer.indexOf(gtagCommands[1] as unknown), 1);
  const lastDataLayerEntry = dataLayer[dataLayer.length - 1] as { event?: string };
  assert.equal(lastDataLayerEntry.event, 'gtm.js');
});

test('revocation persists and prevents loading on the next page', () => {
  saveMeasurementConsent({ analytics: true, advertising: true });
  assert.equal(loadGtmIfConsented(readMeasurementConsent()!, 'GTM-ABC123'), true);
  const existingDataLayer = (window as Window & { dataLayer?: Array<Record<string, unknown>> })
    .dataLayer!;
  const existingStartupEvents = existingDataLayer.filter(
    (event) => event.event === 'gtm.js',
  ).length;

  saveMeasurementConsent({ analytics: false, advertising: false });
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
  assert.deepEqual(existingDataLayer[existingDataLayer.length - 1], {
    event: 'crcn_consent_preferences',
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  const gtagUpdates = existingDataLayer.filter((entry) => 'length' in entry) as unknown as Array<
    ArrayLike<unknown>
  >;
  assert.deepEqual(
    [
      gtagUpdates[gtagUpdates.length - 1]?.[0],
      gtagUpdates[gtagUpdates.length - 1]?.[1],
      gtagUpdates[gtagUpdates.length - 1]?.[2],
    ],
    [
      'consent',
      'update',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ],
  );
  assert.equal(loadGtmIfConsented(readMeasurementConsent()!, 'GTM-ABC123'), false);
  assert.equal(document.querySelectorAll('#crcn-gtm-script').length, 1);
  assert.equal(
    existingDataLayer.filter((event) => event.event === 'gtm.js').length,
    existingStartupEvents,
  );
});

test('preference UI saves independent choices and restores them when reopened', () => {
  const view = render(React.createElement(MeasurementPreferences, { showReopenButton: true }));
  assert.equal(
    document.activeElement,
    view.getByRole('heading', { name: 'Preferências de medição' }),
  );
  fireEvent.click(view.getByRole('button', { name: 'Recusar' }));
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
  const reopen = view.getByRole('button', { name: 'Preferências de medição' });
  assert.equal(document.activeElement, reopen);
  fireEvent.click(reopen);
  assert.equal(
    document.activeElement,
    view.getByRole('heading', { name: 'Preferências de medição' }),
  );
  const getAnalytics = () =>
    view.getByRole('checkbox', { name: 'Permitir analytics (medição de uso)' }) as HTMLInputElement;
  const getAdvertising = () =>
    view.getByRole('checkbox', { name: 'Permitir publicidade' }) as HTMLInputElement;
  assert.equal(getAnalytics().checked, false);
  assert.equal(getAdvertising().checked, false);
  fireEvent.click(getAnalytics());
  fireEvent.click(view.getByRole('button', { name: 'Salvar escolhas' }));
  assert.deepEqual(readMeasurementConsent(), { analytics: true, advertising: false });
  assert.equal(
    document.activeElement,
    view.getByRole('button', { name: 'Preferências de medição' }),
  );

  fireEvent.click(view.getByRole('button', { name: 'Preferências de medição' }));
  assert.equal(getAnalytics().checked, true);
  assert.equal(getAdvertising().checked, false);
  fireEvent.click(getAnalytics());
  fireEvent.click(getAdvertising());
  fireEvent.click(view.getByRole('button', { name: 'Salvar escolhas' }));
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: true });

  fireEvent.click(view.getByRole('button', { name: 'Preferências de medição' }));
  assert.equal(getAnalytics().checked, false);
  assert.equal(getAdvertising().checked, true);
  fireEvent.click(view.getByRole('button', { name: 'Recusar' }));
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
});

test('single-category consent does not load GTM', () => {
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: false }, 'GTM-ABC123'), false);
  assert.equal(loadGtmIfConsented({ analytics: false, advertising: true }, 'GTM-ABC123'), false);
  assert.equal(document.querySelector('#crcn-gtm-script'), null);
  assert.equal((window as Window & { dataLayer?: unknown[] }).dataLayer, undefined);
});

test('invalid GTM IDs do not initialize consent commands or load a network script', () => {
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'G-ABC123'), false);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, ''), false);
  assert.equal((window as Window & { dataLayer?: unknown[] }).dataLayer, undefined);
  assert.equal(document.querySelector('script[src]'), null);
});

test('purchase requires consent, a loaded tag, confirmed payment and a valid BRL total, and emits once', async () => {
  const order: DirectBookingOrderSummary = {
    status: 'confirmado',
    publicReference: 'B'.repeat(40),
    reservationConfirmed: true,
    listingId: 'JQ08G',
    guestName: 'Never sent',
    from: '2026-11-10',
    to: '2026-11-12',
    quoteTotal: '850.00',
    currency: 'BRL',
    paymentStatus: 'approved',
    expiresAt: null,
    createdAt: null,
  };
  assert.equal(await emitConfirmedPurchase(order), false);
  saveMeasurementConsent({ analytics: true, advertising: true });
  assert.equal(await emitConfirmedPurchase(order), false);
  loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123');
  assert.equal(await emitConfirmedPurchase({ ...order, status: 'pagamento_pendente' }), false);
  assert.equal(await emitConfirmedPurchase({ ...order, paymentStatus: 'pending' }), false);
  assert.equal(await emitConfirmedPurchase({ ...order, quoteTotal: 'NaN' }), false);
  assert.equal(await emitConfirmedPurchase(order), true);
  assert.equal(await emitConfirmedPurchase(order), false);
  const events =
    (window as Window & { dataLayer?: Array<Record<string, unknown>> }).dataLayer ?? [];
  const purchases = events.filter((event) => event.event === 'purchase');
  assert.equal(purchases.length, 1);
  assert.match(String(purchases[0]?.transaction_id), /^crcn_[a-f0-9]{64}$/);
  assert.notEqual(purchases[0]?.transaction_id, order.publicReference);
  assert.deepEqual(
    { ...purchases[0], transaction_id: undefined },
    {
      event: 'purchase',
      transaction_id: undefined,
      currency: 'BRL',
      value: 850,
      items: [{ item_id: 'JQ08G' }],
    },
  );
});

test('purchase fails closed when cryptographic hashing is unavailable or rejects', async () => {
  const order: DirectBookingOrderSummary = {
    status: 'confirmado',
    publicReference: 'C'.repeat(40),
    reservationConfirmed: true,
    listingId: 'JQ08G',
    guestName: 'Never sent',
    from: '2026-11-10',
    to: '2026-11-12',
    quoteTotal: '850.00',
    currency: 'BRL',
    paymentStatus: 'approved',
    expiresAt: null,
    createdAt: null,
  };
  saveMeasurementConsent({ analytics: true, advertising: true });
  loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123');
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    assert.equal(await emitConfirmedPurchase(order), false);
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: async () => {
            throw new Error('unavailable');
          },
        },
      },
    });
    assert.equal(await emitConfirmedPurchase(order), false);
    const events =
      (window as Window & { dataLayer?: Array<Record<string, unknown>> }).dataLayer ?? [];
    assert.equal(events.filter((event) => event.event === 'purchase').length, 0);
  } finally {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  }
});

test('funnel events require consent and a loaded tag, validate item IDs and omit free text', () => {
  assert.equal(emitFunnelEvent({ event: 'search', has_dates: true, guests: 2 }), false);
  saveMeasurementConsent({ analytics: true, advertising: true });
  assert.equal(emitFunnelEvent({ event: 'search', has_dates: true, guests: 2 }), false);
  loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123');
  assert.equal(emitFunnelEvent({ event: 'search', has_dates: true, guests: 2 }), true);
  assert.equal(emitFunnelEvent({ event: 'view_item', items: [{ item_id: 'JQ08G' }] }), true);
  assert.equal(emitFunnelEvent({ event: 'begin_checkout', items: [{ item_id: 'JQ08G' }] }), true);
  assert.equal(emitFunnelEvent({ event: 'add_payment_info', payment_type: 'pix' }), true);
  assert.equal(
    emitFunnelEvent({ event: 'view_item', items: [{ item_id: 'bad/email@example.test' }] }),
    false,
  );
  const events =
    (window as Window & { dataLayer?: Array<Record<string, unknown>> }).dataLayer ?? [];
  assert.deepEqual(
    events.filter((event) =>
      ['search', 'view_item', 'begin_checkout', 'add_payment_info'].includes(String(event.event)),
    ),
    [
      { event: 'search', has_dates: true, guests: 2 },
      { event: 'view_item', items: [{ item_id: 'JQ08G' }] },
      { event: 'begin_checkout', items: [{ item_id: 'JQ08G' }] },
      { event: 'add_payment_info', payment_type: 'pix' },
    ],
  );
});

test('view_item_list requires a nonempty safe list, consent and GTM', () => {
  assert.equal(emitViewItemList(['JQ08G', 'LG02J']), false);
  saveMeasurementConsent({ analytics: true, advertising: true });
  assert.equal(emitViewItemList(['JQ08G', 'LG02J']), false);
  loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123');

  assert.equal(emitViewItemList([]), false);
  assert.equal(emitViewItemList(['JQ08G', 'guest@example.test']), false);
  assert.equal(emitViewItemList(['JQ08G', 'LG02J']), true);

  const events =
    (window as Window & { dataLayer?: Array<Record<string, unknown>> }).dataLayer ?? [];
  assert.deepEqual(
    events.filter((event) => event.event === 'view_item_list'),
    [
      {
        event: 'view_item_list',
        items: [{ item_id: 'JQ08G' }, { item_id: 'LG02J' }],
      },
    ],
  );
});
