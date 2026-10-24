import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

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
const { render, cleanup, fireEvent, screen, within } = await import('@testing-library/react');
const { FilterModal } = await import('../src/components/search/FilterModal.tsx');
const { createDefaultSearchFilters } = await import('../src/utils/searchUrlState.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('synchronizes its draft after external filters are cleared while the modal stays mounted', () => {
  const selectedFilters = {
    ...createDefaultSearchFilters(),
    amenities: ['Piscina'],
    minBedrooms: 2,
  };
  const { rerender } = render(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters: selectedFilters,
      properties: [],
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
    }),
  );

  const amenity = Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Piscina'),
  );
  const bedroomTwo = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === '2+' && button.getAttribute('aria-pressed') === 'true',
  );
  assert.equal(amenity?.getAttribute('aria-pressed'), 'true');
  assert.ok(bedroomTwo);

  rerender(
    React.createElement(FilterModal, {
      isOpen: false,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      properties: [],
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
    }),
  );
  rerender(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      properties: [],
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
    }),
  );

  const resetAmenity = Array.from(document.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Piscina'),
  );
  const anyBedrooms = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === 'Qualquer' && button.getAttribute('aria-pressed') === 'true',
  );
  assert.equal(resetAmenity?.getAttribute('aria-pressed'), 'false');
  assert.ok(anyBedrooms);
});

test('updates the matching accommodation count while changing draft filters', () => {
  const filters = createDefaultSearchFilters();
  const properties = [
    {
      ...STAYS_NET_APARTMENTS[0]!,
      id: 'pool-listing',
      amenities: ['Piscina'],
      listingAmenities: [],
      propertyAmenities: [],
    },
    {
      ...STAYS_NET_APARTMENTS[0]!,
      id: 'sauna-listing',
      amenities: ['Sauna'],
      listingAmenities: [],
      propertyAmenities: [],
    },
  ];
  render(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters,
      properties,
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
    }),
  );

  assert.ok(screen.getByRole('button', { name: 'Mostrar 2 acomodações' }));
  fireEvent.click(screen.getByRole('button', { name: 'Piscina' }));
  assert.ok(screen.getByRole('button', { name: 'Mostrar 1 acomodação' }));
  fireEvent.click(screen.getByRole('button', { name: 'Piscina' }));
  assert.ok(screen.getByRole('button', { name: 'Mostrar 2 acomodações' }));
});

test('filter actions remain touch-sized and stack at narrow viewports', () => {
  render(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      properties: [],
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
    }),
  );

  const clearButton = screen.getByRole('button', { name: 'Limpar tudo' });
  const applyButton = screen.getByRole('button', { name: 'Mostrar 0 acomodações' });

  assert.match(clearButton.className, /min-h-11/);
  assert.match(applyButton.className, /min-h-11/);
  assert.match(applyButton.className, /w-full/);
  assert.match(applyButton.className, /min-\[480px\]:w-auto/);
  assert.match(clearButton.parentElement?.className ?? '', /flex-col-reverse/);
  assert.match(clearButton.parentElement?.className ?? '', /min-\[480px\]:flex-row/);
});

test('bedroom and bathroom options are visible in compact grids without horizontal scrolling', () => {
  render(
    React.createElement(FilterModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      properties: [],
      onApplyFilters: () => {},
      onResetFilters: () => {},
      currency: 'BRL',
    }),
  );

  const bedrooms = screen.getByRole('group', { name: 'Quartos mínimos' });
  const bathrooms = screen.getByRole('group', { name: 'Banheiros mínimos' });
  const minPrice = screen.getByLabelText('Preço mínimo por noite');
  const maxPrice = screen.getByLabelText('Preço máximo por noite');
  const priceGrid = minPrice.parentElement?.parentElement?.parentElement;
  const bookingOptions = screen.getByRole('heading', { name: 'Opções de reserva' }).parentElement;
  const amenities = screen.getByRole('heading', {
    name: 'Comodidades populares',
  }).nextElementSibling;

  assert.match(bedrooms.className, /grid-cols-2/);
  assert.match(bedrooms.className, /min-\[480px\]:grid-cols-3/);
  assert.match(bedrooms.className, /sm:grid-cols-6/);
  assert.doesNotMatch(bedrooms.className, /overflow-x-auto/);
  assert.match(bathrooms.className, /grid-cols-2/);
  assert.match(bathrooms.className, /min-\[480px\]:grid-cols-3/);
  assert.match(bathrooms.className, /sm:grid-cols-5/);
  assert.doesNotMatch(bathrooms.className, /overflow-x-auto/);
  assert.match(priceGrid?.className ?? '', /grid-cols-1/);
  assert.match(priceGrid?.className ?? '', /min-\[400px\]:grid-cols-2/);
  assert.match(minPrice.className, /min-w-0/);
  assert.match(maxPrice.className, /min-w-0/);
  const switchRows = bookingOptions?.querySelectorAll(':scope > div.flex') ?? [];
  assert.equal(switchRows.length, 2);
  for (const row of switchRows) {
    assert.match(row.className, /flex-col/);
    assert.match(row.className, /min-\[400px\]:flex-row/);
    assert.match(row.className, /min-\[400px\]:items-center/);
    assert.match(row.className, /min-w-0/);
    assert.match(row.firstElementChild?.className ?? '', /min-w-0/);
    for (const label of row.querySelectorAll('p')) {
      assert.match(label.className, /break-words/);
    }
  }
  const switches = bookingOptions?.querySelectorAll('[role="switch"]') ?? [];
  assert.equal(switches.length, 2);
  for (const control of switches) {
    assert.match(control.className, /self-end/);
    assert.match(control.className, /min-\[400px\]:self-auto/);
    assert.match(control.className, /h-11/);
    assert.match(control.className, /w-11/);
  }
  assert.match(amenities?.className ?? '', /grid-cols-1/);
  assert.match(amenities?.className ?? '', /min-\[380px\]:grid-cols-2/);
  assert.match(amenities?.className ?? '', /sm:grid-cols-3/);
  assert.doesNotMatch(amenities?.querySelector('span')?.className ?? '', /truncate/);

  for (const option of [
    ...within(bedrooms).getAllByRole('button'),
    ...within(bathrooms).getAllByRole('button'),
  ]) {
    assert.match(option.className, /min-h-11/);
    assert.match(option.className, /min-w-0/);
    assert.match(option.className, /whitespace-normal/);
    assert.match(option.className, /break-words/);
  }

  for (const label of amenities?.querySelectorAll('span') ?? []) {
    assert.match(label.className, /min-w-0/);
    assert.match(label.className, /whitespace-normal/);
    assert.match(label.className, /break-words/);
    assert.doesNotMatch(label.className, /truncate/);
  }
});

test('filter dialog keeps keyboard focus inside and returns it to the opener', () => {
  const filters = createDefaultSearchFilters();
  const Harness = () => {
    const [isOpen, setIsOpen] = React.useState(false);

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        { type: 'button', onClick: () => setIsOpen(true) },
        'Abrir modal',
      ),
      React.createElement(FilterModal, {
        isOpen,
        onClose: () => setIsOpen(false),
        filters,
        properties: [],
        onApplyFilters: () => {},
        onResetFilters: () => {},
        currency: 'BRL',
      }),
    );
  };

  render(React.createElement(Harness));
  const opener = screen.getByRole('button', { name: 'Abrir modal' });
  opener.focus();
  fireEvent.click(opener);

  screen.getByRole('dialog', { name: 'Filtros' });
  const closeButton = screen.getByRole('button', { name: 'Fechar filtros' });
  const firstPriceField = screen.getByLabelText('Preço mínimo por noite');
  const applyButton = screen.getByRole('button', { name: 'Mostrar 0 acomodações' });

  assert.equal(document.activeElement, closeButton);
  fireEvent.keyDown(closeButton, { key: 'Tab' });
  assert.equal(document.activeElement, firstPriceField);

  for (let step = 0; step < 40 && document.activeElement !== applyButton; step += 1) {
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  }
  assert.equal(document.activeElement, applyButton);

  fireEvent.keyDown(applyButton, { key: 'Tab' });
  assert.equal(document.activeElement, closeButton);
  fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, applyButton);

  fireEvent.keyDown(applyButton, { key: 'Escape' });
  assert.equal(screen.queryByRole('dialog', { name: 'Filtros' }), null);
  assert.equal(document.activeElement, opener);
});
