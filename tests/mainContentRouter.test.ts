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
    catalogLoading: false,
    onRetryCatalog: () => {},
    availabilitySearchState: 'idle' as const,
    hasAvailableSearchResults: true,
    onRetryAvailabilitySearch: () => {},
    propertyRouteStatus: 'idle' as const,
    onRetryPropertyRoute: () => {},
    savedPropertyIds: [],
    savedProperties: [],
    showTotalWithTaxes: false,
    condominiums: [],
    reservations: [],
    selectedProperty: null,
    accessToken: undefined,
    isOwnerAdmin: false,
    canManagePayments: false,
    onFiltersChange: () => {},
    onRemoveDestinationFilter: () => {},
    onRemoveDateFilter: () => {},
    onRemoveGuestFilter: () => {},
    onClearPropertyRefinements: () => {},
    onClearCatalogFilters: () => {},
    onOpenSearch: () => {},
    onSearchInApp: () => {},
    onOpenAssistant: () => {},
    onSelectCondominium: () => {},
    onToggleSave: () => {},
    onSelectProperty: () => {},
    onStartBooking: () => {},
    onClosePropertyDetail: () => {},
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

test('mobile explore layout keeps search and Sofia actions through 390px while deferring the full search form', () => {
  let openedSearch = 0;
  let openedAssistant = 0;
  const { getAllByRole, getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        onOpenSearch: () => {
          openedSearch += 1;
        },
        onOpenAssistant: () => {
          openedAssistant += 1;
        },
      }),
    }),
  );

  const searchButton = getByRole('button', { name: 'Pesquisar datas e hóspedes' });
  const assistantButton = getAllByRole('button', {
    name: 'Falar com Sofia, assistente virtual',
  })[0]!;
  const inlineSearch = getByRole('search');

  assert.equal(searchButton.textContent, 'Datas e hóspedes');
  assert.match(searchButton.className, /min-h-11/);
  assert.match(searchButton.parentElement?.className ?? '', /min-\[400px\]:hidden/);
  assert.match(
    inlineSearch.parentElement?.parentElement?.parentElement?.className ?? '',
    /max-\[399px\]:hidden/,
  );

  fireEvent.click(searchButton);
  fireEvent.click(assistantButton);

  assert.equal(openedSearch, 1);
  assert.equal(openedAssistant, 1);
});

test('short landscape explore layout replaces the tall inline search with compact actions', () => {
  const { getAllByRole, getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps(),
    }),
  );

  const searchButton = getByRole('button', { name: 'Pesquisar datas e hóspedes' });
  const assistantButton = getAllByRole('button', {
    name: 'Falar com Sofia, assistente virtual',
  })[0]!;
  const inlineSearch = getByRole('search');

  assert.match(searchButton.parentElement?.className ?? '', /\[@media\(max-height:400px\)\]:grid/);
  assert.match(searchButton.parentElement?.className ?? '', /\[@media\(max-height:400px\)\]:mb-1/);
  assert.match(
    inlineSearch.parentElement?.parentElement?.parentElement?.className ?? '',
    /\[@media\(max-height:400px\)\]:hidden/,
  );
  assert.ok(assistantButton);
});

test('simulated catalogue shows its warning before the search and results', () => {
  const simulatedProperty = {
    ...STAYS_NET_APARTMENTS[0]!,
    simulatedData: true,
    dataSource: 'stays-simulated' as const,
  };
  const { getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({ filteredProperties: [simulatedProperty] }),
    }),
  );

  const status = getByRole('status');
  assert.equal(
    status.textContent,
    'Ambiente de simulação: preços e disponibilidade são fictícios. Reservas e pagamentos não são realizados.',
  );
  assert.match(status.className, /max-height:400px/);
  assert.match(status.className, /max-\[400px\]:text-xs/);
  assert.match(status.className, /max-width:639px/);
  assert.match(
    getByRole('search').querySelector('.grid')?.className ?? '',
    /\[@media\(min-width:480px\)_and_\(max-width:639px\)_and_\(max-height:400px\)\]:grid-cols-4/,
  );
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

test('empty wishlists keep the explore action touch-sized and return to exploration', async () => {
  let explored = 0;
  const { getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        currentView: 'wishlists',
        onExploreMore: () => {
          explored += 1;
        },
      }),
    }),
  );

  await waitFor(() => {
    assert.ok(getByRole('heading', { name: 'Sua lista de favoritos está vazia' }));
  });
  const exploreButton = getByRole('button', { name: 'Começar a explorar' });
  assert.match(exploreButton.className, /min-h-11/);
  assert.match(exploreButton.className, /text-sm/);
  const emptyState = getByRole('heading', {
    name: 'Sua lista de favoritos está vazia',
  }).parentElement;
  assert.match(emptyState?.className ?? '', /\[@media\(max-height:640px\)\]:py-6/);
  assert.match(emptyState?.className ?? '', /\[@media\(max-height:400px\)\]:py-1/);
  assert.match(emptyState?.className ?? '', /\[@media\(max-height:400px\)\]:-mt-5/);
  assert.match(
    getByRole('button', { name: 'Explorar mais lugares' }).className,
    /\[@media\(max-height:400px\)\]:hidden/,
  );
  fireEvent.click(exploreButton);
  assert.equal(explored, 1);
});

test('saved wishlists keep their catalog return action touch-sized', async () => {
  const { getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        currentView: 'wishlists',
        savedProperties: [STAYS_NET_APARTMENTS[0]!],
      }),
    }),
  );

  await waitFor(() => {
    assert.ok(getByRole('heading', { name: 'Lugares Favoritos' }));
  });
  const exploreButton = getByRole('button', { name: 'Explorar mais lugares' });
  assert.match(exploreButton.className, /min-h-11/);
  assert.match(exploreButton.className, /text-sm/);
  assert.match(
    exploreButton.parentElement?.className ?? '',
    /\[@media\(min-width:480px\)_and_\(max-height:400px\)\]:flex-row/,
  );
});

test('condominium route does not render the search form and shows the empty directory state', () => {
  const { getByRole, queryByText } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({ isCondominiumView: true }),
    }),
  );

  assert.ok(getByRole('heading', { name: 'Nenhum condomínio disponível no momento' }));
  assert.equal(queryByText('COMPLEXO / RESORT'), null);
});

test('condominium directory keeps active removable filters visible', () => {
  const filters = {
    ...createDefaultSearchFilters(),
    category: 'condominiums',
    amenities: ['Piscina'],
  };
  const changedFilters: SearchFilters[] = [];
  const { getByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        isCondominiumView: true,
        filters,
        activeFilterCount: 1,
        onFiltersChange: (nextFilters: SearchFilters) => changedFilters.push(nextFilters),
      }),
    }),
  );

  fireEvent.click(getByRole('button', { name: 'Remover filtro: Piscina' }));

  assert.deepEqual(changedFilters[0]?.amenities, []);
  assert.equal(changedFilters[0]?.category, 'condominiums');
});

test('dated search loading and errors replace the condominium directory until availability is confirmed', () => {
  const filters = {
    ...createDefaultSearchFilters(),
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
  };
  const condominiums = [
    {
      id: 'condominium-test',
      name: 'Condomínio de teste',
      description: '',
      images: [],
      accommodationCount: 1,
    },
  ];
  let retryCount = 0;
  const { getByRole, queryByRole, queryByText, rerender } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        isCondominiumView: true,
        filters,
        condominiums,
        availabilitySearchState: 'loading',
        filteredProperties: [STAYS_NET_APARTMENTS[0]!],
      }),
    }),
  );

  assert.ok(getByRole('status'));
  assert.ok(getByRole('heading', { name: 'Verificando disponibilidade…' }));
  assert.equal(queryByText('Condomínio de teste'), null);

  rerender(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        isCondominiumView: true,
        filters,
        condominiums,
        availabilitySearchState: 'error',
        filteredProperties: [],
        hasAvailableSearchResults: false,
        onRetryAvailabilitySearch: () => {
          retryCount += 1;
        },
      }),
    }),
  );

  assert.ok(getByRole('alert'));
  assert.ok(getByRole('heading', { name: 'Não foi possível confirmar a disponibilidade' }));
  assert.equal(queryByText('Condomínio de teste'), null);
  fireEvent.click(getByRole('button', { name: 'Tentar novamente' }));
  assert.equal(retryCount, 1);
  assert.equal(queryByRole('region', { name: 'Condomínios de Caldas Novas' }), null);
});

test('map view shows a retry action when the catalog fails instead of an empty map', () => {
  let retryCount = 0;
  const { getByRole, queryByRole } = render(
    React.createElement(MainContentRouter, {
      ...createRouterProps({
        viewMode: 'map',
        catalogStatus: 'error',
        filteredProperties: [],
        onRetryCatalog: () => {
          retryCount += 1;
        },
      }),
    }),
  );

  assert.ok(getByRole('alert'));
  assert.equal(queryByRole('region', { name: 'Mapa de acomodações' }), null);
  fireEvent.click(getByRole('button', { name: 'Tentar novamente' }));
  assert.equal(retryCount, 1);
});

test('filtered empty pages in grid, map and condominium views offer continuation without claiming global absence', () => {
  for (const view of [
    { viewMode: 'grid', isCondominiumView: false },
    { viewMode: 'map', isCondominiumView: false },
    { viewMode: 'grid', isCondominiumView: true },
  ]) {
    let loads = 0;
    const rendered = render(
      React.createElement(
        MainContentRouter,
        createRouterProps({
          ...view,
          availabilitySearchState: 'success',
          filteredProperties: [],
          filters: {
            ...createDefaultSearchFilters(),
            checkIn: '2027-05-01',
            checkOut: '2027-05-04',
            minBedrooms: 4,
          },
          searchPagination: {
            active: true,
            hasMore: true,
            isLoading: false,
            error: false,
            loadedCount: 12,
          },
          onLoadMoreSearchResults: () => {
            loads += 1;
          },
        }),
      ),
    );
    assert.equal(rendered.queryByText('Nenhuma acomodação disponível para esse período'), null);
    assert.equal(rendered.queryByText('Nenhum imóvel corresponde a esses filtros'), null);
    assert.match(
      rendered.getByRole('region', { name: 'Paginação das acomodações' }).textContent || '',
      /12 acomodações carregadas/,
    );
    fireEvent.click(rendered.getByRole('button', { name: 'Carregar mais' }));
    assert.equal(loads, 1);
    rendered.unmount();
  }
});

test('continuation errors retain the catalog and offer a dedicated retry', () => {
  let loads = 0;
  const { getByRole } = render(
    React.createElement(
      MainContentRouter,
      createRouterProps({
        searchPagination: {
          active: true,
          hasMore: true,
          isLoading: false,
          error: true,
          loadedCount: 1,
        },
        onLoadMoreSearchResults: () => {
          loads += 1;
        },
      }),
    ),
  );
  assert.ok(getByRole('button', { name: `Ver detalhes de ${STAYS_NET_APARTMENTS[0]!.title}` }));
  assert.match(getByRole('alert').textContent || '', /Seus resultados foram mantidos/);
  fireEvent.click(getByRole('button', { name: 'Tentar carregar mais' }));
  assert.equal(loads, 1);
});

test('home mounts discovery structure during catalog loading and preserves it when data arrives', () => {
  const { container, rerender } = render(
    React.createElement(
      MainContentRouter,
      createRouterProps({
        catalogStatus: 'loading',
        catalogLoading: true,
        filteredProperties: [],
      }),
    ),
  );
  const collections = container.querySelector('[aria-label="Coleções de hospedagens"]');
  assert.ok(
    collections,
    'the dated collections must reserve their position before the catalog arrives',
  );
  assert.ok(container.querySelector('[aria-busy="true"]'));
  rerender(React.createElement(MainContentRouter, createRouterProps()));
  assert.equal(container.querySelector('[aria-label="Coleções de hospedagens"]'), collections);
  rerender(React.createElement(MainContentRouter, createRouterProps({ filteredProperties: [] })));
  assert.equal(container.querySelector('[aria-label="Coleções de hospedagens"]'), null);
});

test('pagination keeps keyboard focus while loading and ignores repeated activation', async () => {
  const { SearchPagination } = await import('../src/components/search/SearchPagination.tsx');
  let loads = 0;
  const state = { active: true, hasMore: true, isLoading: false, error: false, loadedCount: 12 };
  const { getByRole, rerender } = render(
    React.createElement(SearchPagination, {
      state,
      onLoadMore: () => {
        loads += 1;
      },
    }),
  );
  const button = getByRole('button', { name: 'Carregar mais' });
  button.focus();
  rerender(
    React.createElement(SearchPagination, {
      state: { ...state, isLoading: true },
      onLoadMore: () => {
        loads += 1;
      },
    }),
  );
  assert.equal(document.activeElement, button);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  fireEvent.click(button);
  assert.equal(loads, 0);
  rerender(
    React.createElement(SearchPagination, {
      state,
      onLoadMore: () => {
        loads += 1;
      },
    }),
  );
  fireEvent.click(button);
  assert.equal(loads, 1);
});
