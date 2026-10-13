import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
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
const { Header } = await import('../src/components/Header.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('account menu exposes expanded state and Escape restores focus to its trigger', () => {
  const { getByRole, queryByRole } = render(
    React.createElement(Header, {
      onOpenSearch: () => {},
      currentView: 'explore',
      setCurrentView: () => {},
      currency: 'BRL',
      setCurrency: () => {},
      tripsCount: 0,
      isAccountConnected: false,
      onOpenAccount: () => {},
      onSignOut: async () => {},
      ownerAccessStatus: 'none',
      ownerRequestLoading: false,
      onRequestOwnerAccess: async () => {},
      isOwnerAdmin: false,
    }),
  );

  const trigger = getByRole('button', { name: 'Minha Conta' });
  trigger.focus();
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  fireEvent.click(trigger);

  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.ok(getByRole('group', { name: 'Opções da conta' }));
  fireEvent.keyDown(document, { key: 'Escape' });

  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(queryByRole('group', { name: 'Opções da conta' }), null);
  assert.equal(document.activeElement, trigger);
});
