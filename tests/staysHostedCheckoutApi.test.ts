import assert from 'node:assert/strict';
import test from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import {
  isSafeStaysCheckoutUrl,
  navigateToHostedCheckout,
} from '../src/utils/hostedCheckoutNavigation.ts';
import { updateMeasurementAttribution } from '../src/utils/measurementAttribution.ts';
import { saveMeasurementConsent } from '../src/utils/measurementConsent.ts';
import { JSDOM } from 'jsdom';

test('accepts the minimal hosted checkout readiness contract', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ready: false,
        code: 'checkout_disabled',
        message: 'Checkout indisponível.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    assert.deepEqual(await crcnBackendApi.getStaysCheckoutReadiness(), {
      ready: false,
      code: 'checkout_disabled',
      message: 'Checkout indisponível.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forwards only sanitized consented campaign attribution to the Stays checkout', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://crcn.caldasindica.com/?utm_source=google&utm_medium=cpc&gclid=click-123&email=guest@example.test',
  });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  saveMeasurementConsent({ analytics: true, advertising: true });
  updateMeasurementAttribution({ analytics: true, advertising: true }, dom.window.location.search);
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  let clickedUrl = '';
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    clickedUrl = this.href;
  };

  try {
    assert.equal(
      navigateToHostedCheckout(
        'https://www.centraldereservascaldas.com.br/customer/pt/reservation/ABC/details?token=abc',
      ),
      true,
    );
    const redirected = new URL(clickedUrl);
    assert.equal(redirected.searchParams.get('token'), 'abc');
    assert.equal(redirected.searchParams.get('utm_source'), 'google');
    assert.equal(redirected.searchParams.get('utm_medium'), 'cpc');
    assert.equal(redirected.searchParams.get('gclid'), 'click-123');
    assert.equal(redirected.searchParams.has('email'), false);
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    dom.window.localStorage.clear();
    dom.window.sessionStorage.clear();
  }
});

test('fails closed for a malformed readiness response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ready: 'yes' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    assert.equal(await crcnBackendApi.getStaysCheckoutReadiness(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses a real link only for an HTTPS Stays checkout host', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://crcn.caldasindica.com',
  });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  let clickedUrl = '';
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    clickedUrl = this.href;
  };

  try {
    assert.equal(
      navigateToHostedCheckout('https://crcn.stays.com.br/customer/pt/booking?token=abc'),
      true,
    );
    assert.equal(clickedUrl, 'https://crcn.stays.com.br/customer/pt/booking?token=abc');
    assert.equal(document.querySelector('[data-stays-checkout-link]'), null);
    assert.equal(
      isSafeStaysCheckoutUrl(
        'https://www.centraldereservascaldas.com.br/customer/pt/reservation/ABC/details',
      ),
      true,
    );
    assert.equal(isSafeStaysCheckoutUrl('https://stays.com.br.evil.example/checkout'), false);
    assert.equal(navigateToHostedCheckout('javascript:alert(1)'), false);
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
  }
});
