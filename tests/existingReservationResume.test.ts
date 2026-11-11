import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';
import type { CheckoutResumeResponse } from '../src/services/checkoutApi.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/checkout/test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle });
const React = (await import('react')).default;
const { render, waitFor, cleanup } = await import('@testing-library/react');
const { CheckoutResumePage } = await import('../src/components/booking/CheckoutResumePage.tsx');
after(() => dom.window.close());

test('existing reservation resume does not offer unverified payment methods and moves focus', async () => {
  const reference = 'A'.repeat(40);
  const data: CheckoutResumeResponse = {
    success: true,
    order: { publicReference: reference, origin: 'stays_existing', status: 'pre_reservado', reservationConfirmed: false, listingId: 'example', guestName: 'Test', from: '2026-11-19', to: '2026-11-22', quoteTotal: '197.50', currency: 'BRL', paymentStatus: null, expiresAt: new Date(Date.now() + 60000).toISOString(), createdAt: null },
    confirmation: null,
    payment: { enabled: true, methods: ['pix', 'card'], publicKey: null, provider: 'cielo', attempt: null },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data, focusOnMount: true }));
    await waitFor(() => assert.ok(view.getByText(/fale com nosso atendimento antes de iniciar outra tentativa/)));
    assert.equal(view.queryByRole('button', { name: /gerar pagamento pix/i }), null);
    assert.equal(view.queryByLabelText('Número do cartão'), null);
    assert.equal(document.activeElement?.getAttribute('aria-labelledby'), 'checkout-resume-title');
  } finally {
    cleanup();
  }
});
