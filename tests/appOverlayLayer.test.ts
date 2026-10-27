import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { Dispatch, SetStateAction } from 'react';
import type { AppOverlayLayerProps } from '../src/components/AppOverlayLayer.tsx';
import type { SearchFilters } from '../src/types';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
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
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { AppOverlayLayer } = await import('../src/components/AppOverlayLayer.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const originalGetResorts = crcnBackendApi.getResorts;

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  crcnBackendApi.getResorts = originalGetResorts;
});

function createOverlayProps(): AppOverlayLayerProps {
  const filters = createDefaultSearchFilters();
  const setFilters: Dispatch<SetStateAction<SearchFilters>> = () => {};

  return {
    currency: 'BRL',
    filters,
    defaultFilters: createDefaultSearchFilters(),
    setFilters,
    selectedProperty: null,
    selectedCondominium: null,
    bookingPayload: null,
    checkoutGuestPrefill: { fullName: '', email: '', phone: '' },
    accountModalMode: null,
    savedPropertyIds: [],
    catalogFocusRef: React.createRef<HTMLElement>(),
    filteredPropertiesCount: 0,
    isSofiaOpen: false,
    isSearchOpen: false,
    isFilterOpen: false,
    isCreateListingOpen: false,
    onClosePropertyDetail: () => {},
    onStartBooking: () => {},
    onToggleSave: () => {},
    onCloseCondominium: () => {},
    onCloseSofia: () => {},
    onSelectPropertyFromSofia: () => {},
    onApplySofiaFilters: () => {},
    onCloseCheckout: () => {},
    onCloseAccount: () => {},
    onCloseSearch: () => {},
    onCloseFilter: () => {},
    onCloseCreateListing: () => {},
    onAddProperty: () => {},
    onSearchInApp: async () => {},
  };
}

test('keeps overlays deferred until open and wires the search close action', async () => {
  crcnBackendApi.getResorts = async () => [];
  const props = createOverlayProps();
  let closeCalls = 0;
  const { rerender } = render(React.createElement(AppOverlayLayer, props));

  assert.equal(screen.queryByRole('dialog'), null);

  rerender(
    React.createElement(AppOverlayLayer, {
      ...props,
      isSearchOpen: true,
      onCloseSearch: () => {
        closeCalls += 1;
      },
    }),
  );

  const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Buscar hospedagens' }));
  assert.ok(dialog);
  fireEvent.click(screen.getByRole('button', { name: 'Fechar busca de hospedagens' }));
  assert.equal(closeCalls, 1);
});
