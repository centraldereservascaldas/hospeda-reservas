import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { SearchFilters } from '../src/types/index.ts';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(dom.window, {
  requestAnimationFrame: (callback: (timestamp: number) => void) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
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
const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { MainContentRouter } = await import('../src/components/MainContentRouter.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function createRouterProps(overrides: Record<string, unknown> = {}) {
  const filters: SearchFilters = createDefaultSearchFilters();
  return {
    currentView: 'explore' as const,
    catalogFocusRef: React.createRef<HTMLElement>(),
    isCondominiumView: false,
    viewMode: 'grid' as const,
    filters,
    activeFilterCount: 0,
    defaultFilters: filters,
    currency: 'BRL' as const,
    filteredProperties: [STAYS_NET_APARTMENTS[0]!],
    catalogStatus: 'ready' as const,
    savedPropertyIds: [],
    savedProperties: [],
    showTotalWithTaxes: false,
    condominiums: [],
    reservations: [],
    selectedProperty: null,
    accessToken: undefined,
    isOwnerAdmin: false,
    onFiltersChange: () => {},
    onSearchInApp: () => {},
    onOpenAssistant: () => {},
    onSelectCondominium: () => {},
    onToggleSave: () => {},
    onSelectProperty: () => {},
    onResetFilters: () => {},
    onCancelReservation: async () => {},
    onExploreMore: () => {},
    ...overrides,
  };
}

test('explore route renders the property catalog and delegates selection', () => {
  const selectedProperties: string[] = [];
  const { getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        onSelectProperty: (property: { id: string }) => selectedProperties.push(property.id),
      }),
    }),
  );

  fireEvent.click(
    getByRole('button', { name: `Ver detalhes de ${STAYS_NET_APARTMENTS[0]!.title}` }),
  );
  assert.deepEqual(selectedProperties, [STAYS_NET_APARTMENTS[0]!.id]);
});

test('trips route lazy loads the existing trips view with its empty state', async () => {
  const { getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({ currentView: 'trips' }),
    }),
  );

  await waitFor(() => {
    assert.ok(getByRole('heading', { name: 'Minhas Viagens e Reservas' }));
  });
});

test('condominium route does not render the search form and shows the empty directory state', () => {
  const { getByRole, queryByText } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({ isCondominiumView: true }),
    }),
  );

  assert.ok(getByRole('heading', { name: 'Nenhum condomínio disponível no catálogo' }));
  assert.equal(queryByText('COMPLEXO / RESORT'), null);
});
