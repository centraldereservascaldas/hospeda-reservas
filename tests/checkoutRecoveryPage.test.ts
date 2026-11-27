import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/checkout',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
});

const React = (await import('react')).default;
const { cleanup, render, screen } = await import('@testing-library/react');
const { CheckoutRecoveryPage } = await import('../src/components/booking/CheckoutRecoveryPage.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('checkout recovery is a focused page without background content', () => {
  render(
    React.createElement(CheckoutRecoveryPage, {
      status: 'error',
      onRetry: () => {},
      onBack: () => {},
    }),
  );

  assert.equal(screen.getAllByRole('main').length, 1);
  assert.equal(screen.getAllByRole('button').length, 2);
  assert.equal(screen.queryByRole('navigation'), null);
  assert.equal(document.activeElement?.textContent, 'Recuperar checkout');
  assert.equal(screen.getByRole('status').textContent?.startsWith('Não foi possível'), true);
});

test('checkout recovery loading state exposes back action and progress status', () => {
  render(
    React.createElement(CheckoutRecoveryPage, {
      status: 'loading',
      onRetry: () => {},
      onBack: () => {},
    }),
  );

  assert.equal(screen.getAllByRole('button').length, 1);
  assert.equal(screen.getByRole('status').textContent, 'Conferindo disponibilidade e preço…');
});
