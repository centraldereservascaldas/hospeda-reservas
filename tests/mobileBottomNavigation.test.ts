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
const { MobileBottomNavigation, resolveMobileNavigationTarget } =
  await import('../src/components/MobileBottomNavigation.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('mobile navigation names its landmark, exposes the active page, and navigates', () => {
  const navigated: string[] = [];
  const { getByRole, queryByRole } = render(
    React.createElement(MobileBottomNavigation, {
      currentView: 'explore',
      onNavigate: (view: string) => navigated.push(view),
      showHost: false,
      hasSavedProperties: true,
      hasConfirmedReservations: true,
    }),
  );

  const navigation = getByRole('navigation', { name: 'Navegação principal' });
  const explore = getByRole('button', { name: 'Explorar' });
  const favorites = getByRole('button', { name: 'Favoritos' });
  const reservations = getByRole('button', { name: 'Reservas' });

  assert.ok(navigation);
  assert.match(navigation.className, /\[@media\(max-height:400px\)\]:py-1/);
  assert.equal(explore.getAttribute('aria-current'), 'page');
  for (const item of [explore, favorites, reservations]) {
    assert.match(item.className, /min-h-11/);
    assert.match(item.className, /min-w-11/);
  }
  assert.equal(favorites.hasAttribute('aria-current'), false);
  assert.equal(navigation.querySelectorAll('[aria-hidden="true"]').length, 5);
  assert.equal(queryByRole('button', { name: 'Proprietário' }), null);

  fireEvent.click(favorites);
  fireEvent.click(reservations);
  assert.deepEqual(navigated, ['wishlists', 'trips']);
});

test('mobile navigation displays the owner destination when access is approved', () => {
  const { getByRole } = render(
    React.createElement(MobileBottomNavigation, {
      currentView: 'host',
      onNavigate: () => {},
      showHost: true,
      hasSavedProperties: false,
      hasConfirmedReservations: false,
    }),
  );

  assert.equal(getByRole('button', { name: 'Proprietário' }).getAttribute('aria-current'), 'page');
  const navigation = getByRole('navigation', { name: 'Navegação principal' });
  assert.match(navigation.className, /max-\[400px\]:px-2/);
  for (const label of ['Explorar', 'Favoritos', 'Reservas', 'Proprietário']) {
    const item = getByRole('button', { name: label });
    assert.match(item.className, /max-\[400px\]:text-xs/);
    assert.match(item.className, /min-h-11/);
    assert.match(item.className, /min-w-11/);
  }
});

test('mobile navigation keeps the owner route gated by approved access', () => {
  assert.equal(resolveMobileNavigationTarget('host', true), 'host');
  assert.equal(resolveMobileNavigationTarget('host', false), 'explore');
  assert.equal(resolveMobileNavigationTarget('trips', false), 'trips');
  assert.equal(resolveMobileNavigationTarget('wishlists', false), 'wishlists');
});
