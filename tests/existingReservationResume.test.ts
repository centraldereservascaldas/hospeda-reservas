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
  PopStateEvent: dom.window.PopStateEvent,
  getComputedStyle: dom.window.getComputedStyle,
});
const React = (await import('react')).default;
const { render, waitFor, cleanup } = await import('@testing-library/react');
const { CheckoutResumePage } = await import('../src/components/booking/CheckoutResumePage.tsx');
after(() => dom.window.close());

test('existing reservation confirmation uses customer-facing payment language', () => {
  const reference = 'H'.repeat(40);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'pago_em_confirmacao',
      reservationConfirmed: false,
      listingId: 'example',
      guestName: 'Test',
      from: '2026-11-19',
      to: '2026-11-22',
      quoteTotal: '197.50',
      currency: 'BRL',
      paymentStatus: 'approved',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: null,
    },
    confirmation: null,
    payment: { enabled: false, methods: [], publicKey: null, provider: 'cielo', attempt: null },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    assert.ok(view.getByText(/Estamos confirmando o pagamento e atualizando sua reserva/));
    assert.equal(view.queryByText(/Stays/i), null);
  } finally {
    cleanup();
  }
});

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

test('a reservation with inconsistent contract evidence directs the customer to support without retry', () => {
  const reference = 'H'.repeat(40);
  const token = 'I'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  saveExistingReservationResumeReference('ZY92K', reference);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'pre_reservado',
      existingContractRequired: false,
      existingContractReviewRequired: true,
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
    payment: { enabled: false, methods: [], publicKey: null, provider: 'cielo', attempt: null },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    assert.ok(view.getByText(/Precisamos conferir o contrato deste pedido/));
    assert.equal(view.queryByRole('link', { name: /revisar e tentar novamente/i }), null);
    assert.equal(view.queryByRole('link', { name: /consultar reserva e tentar novamente/i }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test('an expired reservation missing contract evidence explains how to continue', () => {
  const reference = 'J'.repeat(40);
  const token = 'K'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'expirado',
      existingContractRequired: true,
      existingContractReviewRequired: false,
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
    payment: { enabled: false, methods: [], publicKey: null, provider: 'cielo', attempt: null },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    assert.ok(view.getByText(/Precisamos conferir o contrato deste pedido/));
    assert.equal(view.queryByRole('link', { name: /consultar reserva e tentar novamente/i }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test('a pending Pix with missing contract keeps payment tracking and does not offer acceptance or retry', () => {
  const reference = 'L'.repeat(40);
  const token = 'M'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  saveExistingReservationResumeReference('ZY92K', reference);
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'pre_reservado',
      existingContractRequired: true,
      existingContractReviewRequired: false,
      reservationConfirmed: false,
      listingId: 'example',
      guestName: 'Test',
      from: '2026-11-19',
      to: '2026-11-22',
      quoteTotal: '197.50',
      currency: 'BRL',
      paymentStatus: 'pending',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: null,
    },
    confirmation: null,
    payment: {
      enabled: false,
      methods: [],
      publicKey: null,
      provider: 'cielo',
      attempt: {
        status: 'pending',
        method: 'pix',
        amount: '197.50',
        currency: 'BRL',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        paidAt: null,
        pix: null,
        checkoutUrl: null,
      },
    },
  };
  try {
    const view = render(React.createElement(CheckoutResumePage, { reference, previewData: data }));
    assert.ok(view.getByText(/Precisamos conferir o contrato deste pedido/));
    assert.equal(view.queryByRole('button', { name: /confirmar condições/i }), null);
    assert.equal(view.queryByRole('link', { name: /revisar e tentar novamente/i }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test('an authenticated customer with a saved resume token can accept after a verified decline', async () => {
  const reference = 'Q'.repeat(40);
  const token = 'R'.repeat(64);
  saveCheckoutResumeToken(reference, token, new Date(Date.now() + 60000).toISOString());
  const { checkoutApi } = await import('../src/services/checkoutApi.ts');
  const originalResume = checkoutApi.resumeCheckout;
  const originalFetch = globalThis.fetch;
  const data: CheckoutResumeResponse = {
    success: true,
    order: {
      publicReference: reference,
      origin: 'stays_existing',
      status: 'pagamento_recusado',
      existingContractRequired: true,
      existingContractAcceptable: true,
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
    payment: { enabled: false, methods: [], publicKey: null, provider: 'cielo', attempt: null },
  };
  const calls: Array<{ url: string; init?: Parameters<typeof fetch>[1] }> = [];
  checkoutApi.resumeCheckout = async () => ({ kind: 'ready', data });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/api/public/legal-pages/contrato'))
      return new Response(
        JSON.stringify({
          page: {
            slug: 'contrato',
            path: '/contrato',
            title: 'Contrato',
            version: 'v1',
            publishedAt: '2026-01-01',
            contentHash: 'a'.repeat(64),
            sections: [{ title: 'Condições', content: 'Condições atuais' }],
          },
        }),
        { status: 200 },
      );
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  try {
    const { fireEvent } = await import('@testing-library/react');
    const view = render(
      React.createElement(CheckoutResumePage, { reference, accessToken: 'session-token' }),
    );
    await waitFor(() =>
      assert.ok(view.getByRole('link', { name: 'Abrir contrato da hospedagem' })),
    );
    fireEvent.click(view.getByRole('checkbox', { name: /li e aceito/i }));
    fireEvent.click(view.getByRole('button', { name: 'Confirmar condições' }));
    await waitFor(() => assert.ok(calls.some((call) => call.url.endsWith('/existing-contract'))));
    const request = calls.find((call) => call.url.endsWith('/existing-contract'))!;
    assert.equal(
      (request.init?.headers as Record<string, string>)['X-Checkout-Resume-Token'],
      token,
    );
    assert.ok(calls.every((call) => !call.url.endsWith('/payments')));
  } finally {
    cleanup();
    checkoutApi.resumeCheckout = originalResume;
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
  }
});
