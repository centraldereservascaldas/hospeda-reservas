import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/',
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
const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { ExistingReservationContractAcceptance } =
  await import('../src/components/booking/ExistingReservationContractAcceptance.tsx');
after(() => dom.window.close());

test('accepts the loaded contract with the resume token and does not start payment', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: Parameters<typeof fetch>[1] }> = [];
  let accepted = 0;
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
    const view = render(
      React.createElement(ExistingReservationContractAcceptance, {
        reference: 'R'.repeat(40),
        resumeToken: 'T'.repeat(64),
        onAccepted: () => {
          accepted++;
        },
      }),
    );
    const button = view.getByRole('button', { name: 'Confirmar condições' });
    assert.equal((button as HTMLButtonElement).disabled, true);
    await waitFor(() =>
      assert.ok(view.getByRole('link', { name: 'Abrir contrato da hospedagem' })),
    );
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(button);
    await waitFor(() => assert.equal(accepted, 1));
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /existing-contract$/);
    assert.equal(
      (calls[1].init?.headers as Record<string, string>)['X-Checkout-Resume-Token'],
      'T'.repeat(64),
    );
    assert.equal(JSON.parse(String(calls[1].init?.body)).contentHash, 'a'.repeat(64));
    assert.ok(calls.every((call) => !call.url.endsWith('/payments')));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
