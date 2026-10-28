import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { AppFooter } = await import('../src/components/AppFooter.tsx');

test('app footer shows the active currency and opens listing creation', () => {
  let createListingCalls = 0;
  const { getByRole, getByText, unmount } = render(
    React.createElement(AppFooter, {
      currency: 'BRL',
      onCreateListing: () => {
        createListingCalls += 1;
      },
    }),
  );

  assert.ok(getByText('BRL'));
  const createListingButton = getByRole('button', { name: 'Anuncie seu imóvel' });
  assert.match(createListingButton.className, /min-h-11/);
  assert.match(createListingButton.className, /text-sm/);
  fireEvent.click(createListingButton);
  assert.equal(createListingCalls, 1);
  unmount();
  cleanup();
});

test('app footer only links legal pages returned as valid approved records', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        pages: [
          {
            slug: 'privacidade',
            path: '/privacidade',
            title: 'Aviso de privacidade',
            version: '1.0',
            publishedAt: '2026-10-01',
          },
          {
            slug: 'termos',
            path: 'javascript:alert(1)',
            title: 'Termos',
            version: '1.0',
            publishedAt: '2026-10-01',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    const { findByRole, queryByRole, unmount } = render(
      React.createElement(AppFooter, { currency: 'BRL', onCreateListing: () => {} }),
    );

    const privacyLink = await findByRole('link', { name: 'Aviso de privacidade' });
    assert.equal(privacyLink.getAttribute('href'), '/privacidade');
    assert.equal(queryByRole('link', { name: 'Termos' }), null);
    unmount();
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});
