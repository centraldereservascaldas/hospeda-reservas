import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(dom.window, {
  requestAnimationFrame: (callback: (timestamp: number) => void) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  FormData: dom.window.FormData,
  getComputedStyle: dom.window.getComputedStyle,
  PopStateEvent: dom.window.PopStateEvent,
});

const React = (await import('react')).default;
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { CheckoutModal } = await import('../src/components/booking/CheckoutModal.tsx');
const { checkoutApi } = await import('../src/services/checkoutApi.ts');
const { STAYS_NET_APARTMENTS } = await import('../src/data/staysApartments.ts');
const { saveMeasurementConsent } = await import('../src/utils/measurementConsent.ts');
const { updateMeasurementAttribution } = await import('../src/utils/measurementAttribution.ts');

const quote = {
  success: true,
  listingId: 'JQ08G',
  from: '2027-05-01',
  to: '2027-05-03',
  nights: 2,
  guests: 2,
  pricePerNight: 350,
  dailyRate: 350,
  baseTotal: 700,
  subtotal: 700,
  cleaningFee: 150,
  serviceFee: 0,
  discount: 0,
  total: 850,
  currency: 'BRL' as const,
  feesIncluded: false,
  cleaningIncluded: false,
  fees: [],
  source: 'stays-live' as const,
  breakdown: {
    dailyRateText: 'R$ 350,00 x 2 noites',
    cleaningFeeText: 'Taxa de limpeza',
    serviceFeeText: 'Taxa de serviço',
    totalText: 'R$ 850,00',
  },
};

const bookingData = {
  property: STAYS_NET_APARTMENTS[0]!,
  checkIn: quote.from,
  checkOut: quote.to,
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  nights: 2,
  totalAmount: 850,
  cleaningFee: 150,
  serviceFee: 0,
  discount: 0,
  quote,
};

const originalFetch = globalThis.fetch;
const originalGetCheckoutTerms = checkoutApi.getCheckoutTerms;
const originalGetCheckoutReadiness = checkoutApi.getCheckoutReadiness;

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.localStorage.clear();
  checkoutApi.getCheckoutTerms = originalGetCheckoutTerms;
  checkoutApi.getCheckoutReadiness = originalGetCheckoutReadiness;
  globalThis.fetch = originalFetch;
});

async function submitCheckoutWithConsent(consent: {
  analytics: boolean;
  advertising: boolean;
}): Promise<Record<string, unknown>> {
  const capturedAt = Date.now();
  updateMeasurementAttribution(
    { analytics: true, advertising: true },
    '?utm_source=google&utm_campaign=summer&gclid=google-click&fbclid=meta-click',
    capturedAt,
  );
  saveMeasurementConsent(consent);

  checkoutApi.getCheckoutTerms = async () => ({
    kind: 'ready',
    data: {
      success: true,
      terms: {
        version: 'terms-2026-01',
        snapshot: { version: 'terms-2026-01', cancellation: 'Cancelamento conforme as condições.' },
      },
    },
  });
  checkoutApi.getCheckoutReadiness = async () => ({
    kind: 'ready',
    data: {
      success: true,
      ready: true,
      termsAvailable: true,
      checkoutEnabled: true,
      payment: { enabled: true, methods: ['pix'], publicKey: null, provider: 'mercadopago' },
    },
  });

  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ success: false, errors: { guest: ['Invalid test response'] } }),
      {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  render(
    React.createElement(CheckoutModal, {
      isOpen: true,
      onClose: () => {},
      bookingData,
      currency: 'BRL',
    }),
  );
  await screen.findByRole('checkbox', { name: /Li e aceito as condições/ });
  fireEvent.change(screen.getByLabelText('Nome completo'), {
    target: { value: 'Pessoa de Teste' },
  });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pessoa@example.test' } });
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '+5511999999999' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito as condições/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }));

  await waitFor(() => assert.ok(requestBody));
  return { ...requestBody, _capturedAt: capturedAt };
}

test('checkout carries first and last touch through the form when measurement consent is allowed', async () => {
  const requestBody = await submitCheckoutWithConsent({ analytics: true, advertising: true });

  assert.deepEqual(requestBody.marketingAttribution, {
    firstTouch: {
      capturedAt: requestBody._capturedAt,
      values: {
        utm_source: 'google',
        utm_campaign: 'summer',
        gclid: 'google-click',
        fbclid: 'meta-click',
      },
    },
    lastTouch: {
      capturedAt: requestBody._capturedAt,
      values: {
        utm_source: 'google',
        utm_campaign: 'summer',
        gclid: 'google-click',
        fbclid: 'meta-click',
      },
    },
  });
});

test('checkout removes advertising click IDs after advertising consent is revoked', async () => {
  const requestBody = await submitCheckoutWithConsent({ analytics: true, advertising: false });
  const attribution = requestBody.marketingAttribution as {
    firstTouch: { values: Record<string, string> };
    lastTouch: { values: Record<string, string> };
  };

  assert.deepEqual(attribution.firstTouch.values, {
    utm_source: 'google',
    utm_campaign: 'summer',
  });
  assert.deepEqual(attribution.lastTouch.values, {
    utm_source: 'google',
    utm_campaign: 'summer',
  });
  assert.equal(JSON.stringify(requestBody).includes('google-click'), false);
  assert.equal(JSON.stringify(requestBody).includes('meta-click'), false);
});
