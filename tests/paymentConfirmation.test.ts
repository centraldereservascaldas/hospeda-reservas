import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { navigateToPaymentConfirmation } from '../src/utils/paymentConfirmation';
import type { DirectBookingOrderSummary } from '../src/services/checkoutApi';

test('confirmation URL is reached only for approved payment and never contains the access token', () => {
  const dom = new JSDOM('', { url: 'https://example.test/checkout' });
  const previousWindow = globalThis.window;
  const previousPopStateEvent = globalThis.PopStateEvent;
  Object.assign(globalThis, { window: dom.window, PopStateEvent: dom.window.PopStateEvent });
  try {
    const reference = 'A'.repeat(40);
    const order = {
      publicReference: reference,
      paymentStatus: 'pending',
    } as DirectBookingOrderSummary;
    assert.equal(navigateToPaymentConfirmation(order), false);
    assert.equal(dom.window.location.pathname, '/checkout');
    let navigated = 0;
    dom.window.addEventListener('popstate', () => {
      navigated += 1;
    });
    assert.equal(navigateToPaymentConfirmation({ ...order, paymentStatus: 'approved' }), true);
    assert.equal(dom.window.location.pathname, `/checkout/${reference}/pagamento-confirmado`);
    assert.equal(dom.window.location.search, '');
    assert.equal(navigated, 1);
    assert.equal(
      navigateToPaymentConfirmation({
        ...order,
        paymentStatus: 'approved',
        publicReference: '../bad',
      }),
      false,
    );
  } finally {
    Object.assign(globalThis, { window: previousWindow, PopStateEvent: previousPopStateEvent });
    dom.window.close();
  }
});
