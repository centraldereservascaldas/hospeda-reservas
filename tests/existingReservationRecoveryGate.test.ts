import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/checkout/ZY92K',
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
const { render, waitFor, cleanup, fireEvent } = await import('@testing-library/react');
const { ExistingReservationCheckout } =
  await import('../src/components/booking/ExistingReservationCheckout.tsx');

test('recovery gates checkout while pending and after an uncertain response, with retry', async () => {
  const originalFetch = globalThis.fetch;
  window.sessionStorage.setItem('crcn.existing-reservation.recovery.ZY92K:initial', 'a'.repeat(144));
  let resolveRecovery: ((response: Response) => void) | undefined;
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/recover')) {
      calls++;
      if (calls === 1)
        return new Promise<Response>((resolve) => {
          resolveRecovery = resolve;
        });
      return calls === 2
        ? new Response('{}', { status: 503 })
        : new Response(JSON.stringify({ success: true, restart: true }), { status: 200 });
    }
    if (url.endsWith('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 2,
            adults: 2,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 39500,
            balanceStatus: 'unrecorded_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
          },
        }),
        { status: 200 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(resolveRecovery));
    assert.match(view.container.textContent ?? '', /verificando se já existe/i);
    assert.equal(view.queryByText(/Dados do titular da reserva/i), null);
    resolveRecovery!(new Response('{}', { status: 404 }));
    await waitFor(() =>
      assert.match(
        view.container.textContent ?? '',
        /Não foi possível verificar o pagamento anterior/,
      ),
    );
    assert.equal(view.queryByText(/Dados do titular da reserva/i), null);
    fireEvent.click(view.getByText('Verificar novamente'));
    await waitFor(() => assert.equal(calls, 2));
    await waitFor(() =>
      assert.match(
        view.container.textContent ?? '',
        /Não foi possível verificar o pagamento anterior/,
      ),
    );
    assert.equal(view.queryByText(/Dados do titular da reserva/i), null);
    fireEvent.click(view.getByText('Verificar novamente'));
    await waitFor(() => assert.equal(calls, 3));
    await waitFor(() => assert.ok(view.getByText(/Dados do titular da reserva/i)));
    assert.equal(window.sessionStorage.getItem('crcn.existing-reservation.recovery.ZY92K:initial'), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
