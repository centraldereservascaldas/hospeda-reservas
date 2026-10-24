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
const { render, cleanup, fireEvent, screen, act } = await import('@testing-library/react');
const { ActiveSearchFilters } = await import('../src/components/search/ActiveSearchFilters.tsx');
const { createDefaultSearchFilters } = await import('../src/utils/searchUrlState.ts');
const { useSearchUrlSync } = await import('../src/hooks/useSearchUrlSync.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('names destination removal and preserves remaining filters until reset', () => {
  const defaultFilters = createDefaultSearchFilters();
  const selectedFilters = {
    ...defaultFilters,
    destination: 'Caldas Novas',
    checkIn: '2026-10-15',
    checkOut: '2026-10-17',
    guests: { adults: 3, children: 1, infants: 0, pets: 1 },
    minPrice: 100,
    amenities: ['Piscina'],
    superhostOnly: true,
    instantBookOnly: true,
  };
  const changes: (typeof selectedFilters)[] = [];
  let destinationRemovalRequested = false;
  let clearFiltersRequested = false;
  render(
    React.createElement(ActiveSearchFilters, {
      filters: selectedFilters,
      activeFilterCount: 4,
      defaultFilters,
      onRemoveDestination: () => {
        destinationRemovalRequested = true;
      },
      onRemoveDates: () => {},
      onRemoveGuests: () => {},
      onClearFilters: () => {
        clearFiltersRequested = true;
      },
      onChange: (nextFilters: typeof selectedFilters) => changes.push(nextFilters),
    }),
  );

  assert.ok(screen.getByRole('group', { name: 'Filtros do imóvel ativos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro: destino' }));
  assert.equal(destinationRemovalRequested, true);

  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro: Apenas Superhost' }));
  assert.equal(changes[0]?.superhostOnly, false);
  assert.equal(changes[0]?.instantBookOnly, true);

  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  assert.equal(clearFiltersRequested, true);
  assert.equal(changes.length, 1);
});

test('renders nothing when no destination or counted filter is active', () => {
  render(
    React.createElement(ActiveSearchFilters, {
      filters: createDefaultSearchFilters(),
      activeFilterCount: 0,
      defaultFilters: createDefaultSearchFilters(),
      onChange: () => {},
      onRemoveDestination: () => {},
      onRemoveDates: () => {},
      onRemoveGuests: () => {},
      onClearFilters: () => {},
    }),
  );

  assert.equal(screen.queryByRole('group', { name: 'Filtros do imóvel ativos' }), null);
});

test('keeps trip criteria individually removable without showing a no-op clear action', () => {
  let clearFiltersRequested = false;
  render(
    React.createElement(ActiveSearchFilters, {
      filters: { ...createDefaultSearchFilters(), destination: 'Caldas Novas' },
      activeFilterCount: 0,
      defaultFilters: createDefaultSearchFilters(),
      onChange: () => {},
      onRemoveDestination: () => {},
      onRemoveDates: () => {},
      onRemoveGuests: () => {},
      onClearFilters: () => {
        clearFiltersRequested = true;
      },
    }),
  );

  assert.ok(screen.getByRole('group', { name: 'Critérios da viagem' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro: destino' }));
  assert.equal(clearFiltersRequested, false);
  assert.equal(screen.queryByRole('button', { name: 'Limpar filtros' }), null);
});

test('keeps active property filters compact on mobile while preserving full-size removal targets', () => {
  const defaultFilters = createDefaultSearchFilters();
  render(
    React.createElement(ActiveSearchFilters, {
      filters: {
        ...defaultFilters,
        propertyTypes: ['entire_place'],
        amenities: ['Wi-Fi', 'Piscina'],
        minBedrooms: 2,
      },
      activeFilterCount: 4,
      defaultFilters,
      onChange: () => {},
      onRemoveDestination: () => {},
      onRemoveDates: () => {},
      onRemoveGuests: () => {},
      onClearFilters: () => {},
    }),
  );

  const group = screen.getByRole('group', { name: 'Filtros do imóvel ativos' });
  assert.match(group.className, /gap-x-1 gap-y-1\.5 sm:gap-2/);
  assert.match(screen.getByText('Filtros do imóvel:').className, /sr-only.*sm:not-sr-only/);
  for (const filter of ['Espaço inteiro', 'Wi-Fi', 'Piscina', '2+ quartos']) {
    assert.match(
      screen.getByRole('button', { name: `Remover filtro: ${filter}` }).className,
      /h-11 w-11/,
    );
  }
  assert.ok(screen.getByRole('button', { name: 'Limpar filtros' }));
});

test('shows removable date and guest chips even without property facets', () => {
  const defaultFilters = createDefaultSearchFilters();
  let dateRemovalCount = 0;
  let guestRemovalCount = 0;
  render(
    React.createElement(ActiveSearchFilters, {
      filters: {
        ...defaultFilters,
        checkIn: '2026-10-15',
        checkOut: '2026-10-17',
        guests: { adults: 2, children: 1, infants: 1, pets: 1 },
      },
      activeFilterCount: 0,
      defaultFilters,
      onChange: () => {},
      onRemoveDestination: () => {},
      onRemoveDates: () => {
        dateRemovalCount += 1;
      },
      onRemoveGuests: () => {
        guestRemovalCount += 1;
      },
      onClearFilters: () => {},
    }),
  );

  fireEvent.click(screen.getByRole('button', { name: /^Remover filtro: Datas:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Remover filtro: Hóspedes:/ }));

  assert.equal(dateRemovalCount, 1);
  assert.equal(guestRemovalCount, 1);
  assert.equal(screen.queryByRole('button', { name: 'Limpar filtros' }), null);
});

test('shows and allows removing a property id filter when its destination label is missing', () => {
  let destinationRemovalRequested = false;
  render(
    React.createElement(ActiveSearchFilters, {
      filters: {
        ...createDefaultSearchFilters(),
        destinationPropertyId: 'resort-42',
      },
      activeFilterCount: 0,
      defaultFilters: createDefaultSearchFilters(),
      onChange: () => {},
      onRemoveDestination: () => {
        destinationRemovalRequested = true;
      },
      onRemoveDates: () => {},
      onRemoveGuests: () => {},
      onClearFilters: () => {},
    }),
  );

  assert.ok(screen.getByText('Condomínio selecionado'));
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro: condomínio selecionado' }));
  assert.equal(destinationRemovalRequested, true);
  assert.equal(screen.queryByRole('button', { name: 'Limpar filtros' }), null);
});

test('keeps keyboard focus on the next filter action after removing a chip', async () => {
  const initialFilters = {
    ...createDefaultSearchFilters(),
    amenities: ['Piscina', 'Ar-condicionado'],
  };
  function FilterHarness() {
    const [filters, setFilters] = React.useState(initialFilters);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement('button', { type: 'button', 'aria-label': 'Abrir filtros' }),
      React.createElement(ActiveSearchFilters, {
        filters,
        activeFilterCount: filters.amenities.length,
        defaultFilters: createDefaultSearchFilters(),
        onChange: setFilters,
        onRemoveDestination: () => {},
        onRemoveDates: () => {},
        onRemoveGuests: () => {},
        onClearFilters: () => setFilters(createDefaultSearchFilters()),
      }),
    );
  }

  render(React.createElement(FilterHarness));
  const firstRemoveButton = screen.getByRole('button', {
    name: 'Remover filtro: Piscina',
  });
  assert.match(firstRemoveButton.className, /h-11 w-11.*sm:h-6 sm:w-6/);
  firstRemoveButton.focus();
  fireEvent.click(firstRemoveButton);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    document.activeElement,
    screen.getByRole('button', { name: 'Remover filtro: Ar-condicionado' }),
  );

  const lastRemoveButton = screen.getByRole('button', {
    name: 'Remover filtro: Ar-condicionado',
  });
  lastRemoveButton.focus();
  fireEvent.click(lastRemoveButton);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Abrir filtros' }));
});

test('removing an amenity chip updates the shared URL and preserves trip and category criteria', async () => {
  const originalUrl = window.location.href;
  window.history.replaceState(
    {},
    '',
    '/?from=2026-11-11&to=2026-11-14&guests=3&amenity=Piscina&category=pools_24h',
  );

  function FilterUrlHarness() {
    const [filters, setFilters] = React.useState({
      ...createDefaultSearchFilters(),
      checkIn: '2026-11-11',
      checkOut: '2026-11-14',
      guests: { adults: 2, children: 1, infants: 0, pets: 0 },
      amenities: ['Piscina'],
      category: 'pools_24h',
    });
    useSearchUrlSync(filters);

    return React.createElement(ActiveSearchFilters, {
      filters,
      activeFilterCount: filters.amenities.length,
      defaultFilters: createDefaultSearchFilters(),
      onChange: setFilters,
      onRemoveDestination: () => {},
      onRemoveDates: () => {},
      onRemoveGuests: () => {},
      onClearFilters: () => {},
    });
  }

  try {
    render(React.createElement(FilterUrlHarness));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro: Piscina' }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    const query = new URL(window.location.href).searchParams;
    assert.equal(query.has('amenity'), false);
    assert.equal(query.get('from'), '2026-11-11');
    assert.equal(query.get('to'), '2026-11-14');
    assert.equal(query.get('guests'), '3');
    assert.equal(query.get('category'), 'pools_24h');
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});
