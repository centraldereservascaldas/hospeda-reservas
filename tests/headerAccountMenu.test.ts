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
const { readFileSync } = await import('node:fs');

test('header compacts only on short mobile viewports while preserving its touch target sizing', () => {
  const { container } = render(
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

  assert.match(container.querySelector('header > div > div')?.className ?? '', /max-width:639px/);
  assert.ok(
    Array.from(container.querySelectorAll('header button')).some((button) =>
      button.className.includes('min-h-11'),
    ),
  );
});

test('compact desktop search reserves space for the currency and account controls', () => {
  const { container } = render(
    React.createElement(Header, {
      onOpenSearch: () => {},
      currentView: 'explore',
      compactSearch: true,
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

  const search = container.querySelector<HTMLElement>('[data-shared-search="compact"]');
  const currency = container.querySelector('button[aria-label^="Moeda de exibição BRL"]');
  const account = container.querySelector('button[aria-label="Minha Conta"]');
  const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.equal(search?.dataset.compactSearch, 'true');
  assert.ok(search?.className.includes('header-compact-search'));
  assert.ok(currency);
  assert.ok(account);
  assert.match(stylesheet, /calc\(100vw - var\(--header-edge-spacing\) \* 2 - 32rem\)/);
  assert.match(stylesheet, /--header-compact-search-width: 16rem/);
  assert.match(stylesheet, /--header-compact-search-width: 22rem/);
  assert.match(stylesheet, /calc\(100vw - var\(--header-edge-spacing\) \* 2 - 36rem\)/);
});

test('mobile search prompt has prominent text and a larger search icon', () => {
  const { container } = render(
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

  const searchButton = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Iniciar busca"]',
  );
  assert.ok(searchButton);
  const searchIcon = searchButton.querySelector('svg');
  const searchLabel = searchButton.querySelector('span.text-base');

  assert.ok(searchIcon?.classList.contains('h-6'));
  assert.ok(searchIcon?.classList.contains('w-6'));
  assert.equal(searchLabel?.textContent, 'Iniciar busca');
  assert.ok(searchLabel?.classList.contains('font-bold'));
});

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
  assert.match(getByRole('button', { name: 'Entrar' }).className, /min-h-11/);
  assert.match(getByRole('button', { name: 'Criar conta' }).className, /min-h-11/);
  fireEvent.keyDown(document, { key: 'Escape' });

  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(queryByRole('group', { name: 'Opções da conta' }), null);
  assert.equal(document.activeElement, trigger);
});

test('currency menu exposes expanded state and Escape restores focus to its trigger', () => {
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

  const trigger = getByRole('button', { name: /Moeda de exibição BRL/ });
  trigger.focus();
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  fireEvent.click(trigger);

  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.ok(getByRole('group', { name: 'Opções de moeda' }));
  fireEvent.keyDown(document, { key: 'Escape' });

  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(queryByRole('group', { name: 'Opções de moeda' }), null);
  assert.equal(document.activeElement, trigger);
});
