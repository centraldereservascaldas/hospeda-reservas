import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';
import type { CheckoutResumeResponse } from '../src/services/checkoutApi.ts';
import { saveCheckoutResumeToken } from '../src/utils/checkoutResumeStorage.ts';
import { saveExistingReservationResumeReference } from '../src/utils/existingReservationResumeStorage.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/checkout/test',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});
const React = (await import('react')).default;
const { render, waitFor, cleanup } = await import('@testing-library/react');
const { CheckoutResumePage } = await import('../src/components/booking/CheckoutResumePage.tsx');
after(() => dom.window.close());

test('existing reservation resume does not offer unverified payment methods and moves focus', async () => {
  const reference = 'A'.repeat(40);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'pre_reservado',
      reservationConfirmed: false,
      listingId: 'example',
      guestName: 'Test',
      from: '2026-11-19',
      to: '2026-11-22',
      quoteTotal: '197.50',
      currency: 'BRL',
      paymentStatus: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: null,
    },
    confirmation: null,
    payment: {
      enabled: true,
      methods: ['pix', 'card'],
      publicKey: null,
      provider: 'cielo',
      attempt: null,
    },
  };
  try {
    const view = render(
      React.createElement(CheckoutResumePage, { reference, previewData: data, focusOnMount: true }),
    );
    await waitFor(() => assert.ok(view.getByText(/reserva ainda pode receber um pagamento/)));
    assert.equal(view.queryByRole('button', { name: /gerar pagamento pix/i }), null);
    assert.equal(view.queryByLabelText('Número do cartão'), null);
    assert.equal(document.activeElement?.getAttribute('aria-labelledby'), 'checkout-resume-title');
  } finally {
    cleanup();
  }
});

test('a definitive decline offers a link to review the existing-reservation checkout again', async () => {
  const reference = 'B'.repeat(40);
  const token = 'C'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  saveExistingReservationResumeReference('ZY92K', reference);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'pagamento_recusado',
      reservationConfirmed: false,
      listingId: 'example',
      guestName: 'Test',
      from: '2026-11-19',
      to: '2026-11-22',
      quoteTotal: '197.50',
      currency: 'BRL',
      paymentStatus: 'rejected',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: null,
    },
    confirmation: null,
    payment: {
      enabled: true,
      methods: ['pix', 'card'],
      publicKey: null,
      provider: 'cielo',
      attempt: {
        status: 'rejected',
        method: 'card',
        amount: '197.50',
        currency: 'BRL',
        expiresAt: null,
        paidAt: null,
        pix: null,
        checkoutUrl: null,
      },
    },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    const retryLink = view.getByRole('link', {
      name: 'Revisar e tentar novamente',
    }) as HTMLAnchorElement;
    assert.equal(new URL(retryLink.href).pathname, '/checkout/ZY92K');
    assert.equal(new URL(retryLink.href).searchParams.get('retry'), '1');
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test('an expired terminal payment offers to revalidate the reservation before another attempt', async () => {
  const reference = 'D'.repeat(40);
  const token = 'E'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  saveExistingReservationResumeReference('ZY92K', reference);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'expirado',
      reservationConfirmed: false,
      listingId: 'example',
      guestName: 'Test',
      from: '2026-11-19',
      to: '2026-11-22',
      quoteTotal: '197.50',
      currency: 'BRL',
      paymentStatus: 'expired',
      expiresAt: new Date(Date.now() - 60000).toISOString(),
      createdAt: null,
    },
    confirmation: null,
    payment: {
      enabled: true,
      methods: ['pix', 'card'],
      publicKey: null,
      provider: 'cielo',
      attempt: {
        status: 'expired',
        method: 'pix',
        amount: '197.50',
        currency: 'BRL',
        expiresAt: null,
        paidAt: null,
        pix: null,
        checkoutUrl: null,
      },
    },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    const retryLink = view.getByRole('link', {
      name: 'Consultar reserva e tentar novamente',
    }) as HTMLAnchorElement;
    assert.equal(new URL(retryLink.href).pathname, '/checkout/ZY92K');
    assert.equal(new URL(retryLink.href).searchParams.get('retry'), '1');
    assert.ok(view.getByText(/Consulte novamente a disponibilidade e o saldo/));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test('a reservation pending release after Pix expiry offers only a revalidation path', async () => {
  const reference = 'F'.repeat(40);
  const token = 'G'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  saveExistingReservationResumeReference('ZY92K', reference);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'liberacao_pendente',
      reservationConfirmed: false,
      listingId: 'example',
      guestName: 'Test',
      from: '2026-11-19',
      to: '2026-11-22',
      quoteTotal: '197.50',
      currency: 'BRL',
      paymentStatus: 'expired',
      expiresAt: new Date(Date.now() - 60000).toISOString(),
      createdAt: null,
    },
    confirmation: null,
    payment: {
      enabled: true,
      methods: ['pix', 'card'],
      publicKey: null,
      provider: 'cielo',
      attempt: {
        status: 'expired',
        method: 'pix',
        amount: '197.50',
        currency: 'BRL',
        expiresAt: null,
        paidAt: null,
        pix: null,
        checkoutUrl: null,
      },
    },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    const retryLink = view.getByRole('link', {
      name: 'Consultar reserva e tentar novamente',
    }) as HTMLAnchorElement;
    assert.equal(new URL(retryLink.href).pathname, '/checkout/ZY92K');
    assert.equal(new URL(retryLink.href).searchParams.get('retry'), '1');
    assert.ok(view.getByText(/Consulte novamente a disponibilidade e o saldo/));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
