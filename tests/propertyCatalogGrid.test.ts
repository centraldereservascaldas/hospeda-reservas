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
const { render, cleanup, fireEvent, screen } = await import('@testing-library/react');
const { PropertyCatalogGrid } = await import('../src/components/PropertyCatalogGrid.tsx');
const { STAYS_NET_APARTMENTS } = await import('../src/data/staysApartments.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const commonProps = {
  properties: [],
  currency: 'BRL' as const,
  savedPropertyIds: [],
  showTotalWithTaxes: false,
  onToggleSave: () => {},
  onSelectProperty: () => {},
  onResetFilters: () => {},
};

test('announces catalog loading and errors using status and alert roles', () => {
  const { rerender } = render(
    React.createElement(PropertyCatalogGrid, { ...commonProps, status: 'loading' }),
  );
  assert.match(screen.getByRole('status').textContent || '', /Carregando acomodações/);

  rerender(React.createElement(PropertyCatalogGrid, { ...commonProps, status: 'error' }));
  assert.ok(screen.getByRole('alert'));
  assert.match(screen.getByRole('alert').textContent || '', /Não foi possível carregar/);
});

test('lets the guest reset search filters from the empty-results state', () => {
  let resetCount = 0;
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      onResetFilters: () => {
        resetCount += 1;
      },
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Nenhuma acomodação encontrada' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar todas as acomodações' }));
  assert.equal(resetCount, 1);
});

test('renders a catalog grid for matching accommodations', () => {
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      properties: [STAYS_NET_APARTMENTS[0]!],
    }),
  );

  assert.ok(screen.getByRole('button', { name: 'Ver detalhes de Lacqua DiRoma IV' }));
});
