import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});
const React = (await import('react')).default;
const { render, cleanup, waitFor } = await import('@testing-library/react');
const { CheckoutFooter } = await import('../src/components/booking/CheckoutFooter.tsx');
after(() => dom.window.close());

test('existing checkout footer links only published legal pages and omits the contract', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        pages: [
          {
            slug: 'privacidade',
            path: '/privacidade',
            title: 'Política de Privacidade',
            version: '1',
            publishedAt: '2026-11-20',
          },
          {
            slug: 'contrato',
            path: '/contrato',
            title: 'Contrato',
            version: '1',
            publishedAt: '2026-11-20',
          },
        ],
      }),
      { status: 200 },
    );
  try {
    const view = render(React.createElement(CheckoutFooter, { hideContractLink: true }));
    assert.equal(
      (await view.findByRole('link', { name: 'Política de Privacidade' })).getAttribute('href'),
      '/privacidade',
    );
    assert.equal(view.queryByRole('link', { name: 'Termos de Uso' }), null);
    assert.equal(view.queryByRole('link', { name: /Contrato/ }), null);
  } finally {
    globalThis.fetch = previousFetch;
    cleanup();
  }
});

test('existing checkout footer keeps contact when legal pages are unavailable', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    const view = render(React.createElement(CheckoutFooter, { hideContractLink: true }));
    await waitFor(() => assert.ok(view.getByRole('link', { name: 'Fale com a gente' })));
    assert.equal(view.queryByRole('link', { name: 'Política de Privacidade' }), null);
    assert.equal(view.queryByRole('link', { name: 'Termos de Uso' }), null);
  } finally {
    globalThis.fetch = previousFetch;
    cleanup();
  }
});
