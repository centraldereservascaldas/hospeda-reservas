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
  fireEvent.click(getByRole('button', { name: 'Cadastre seu Imóvel na Central' }));
  assert.equal(createListingCalls, 1);
  unmount();
  cleanup();
});
