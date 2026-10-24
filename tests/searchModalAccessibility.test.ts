import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import type { AccommodationWidgetSearchParams } from '../src/hooks/useAccommodationSearch.ts';
import type { SearchFilters } from '../src/types/index.ts';

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
const { render, fireEvent, cleanup, within } = await import('@testing-library/react');
const { SearchModal } = await import('../src/components/search/SearchModal.tsx');
const { createDefaultSearchFilters } = await import('../src/utils/searchUrlState.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const originalGetResorts = crcnBackendApi.getResorts;

crcnBackendApi.getResorts = async () => [];

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  crcnBackendApi.getResorts = originalGetResorts;
});

test('search mode tabs expose selection and support arrow, Home, and End keys', () => {
  render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {},
      onSearchInApp: () => {},
    }),
  );

  const dialog = within(document.querySelector('[role="dialog"]')!);
  const tablist = dialog.getByRole('tablist', { name: 'Tipo de busca' });
  const tabs = within(tablist).getAllByRole('tab');
  const panel = dialog.getByRole('tabpanel');
  assert.equal(tabs.length, 4);
  assert.equal(tabs[0]?.getAttribute('aria-selected'), 'true');
  assert.equal(tabs[0]?.getAttribute('tabindex'), '0');
  assert.equal(panel.getAttribute('aria-labelledby'), tabs[0]?.id);

  tabs[0]?.focus();
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  assert.equal(document.activeElement, tabs[1]);
  assert.equal(tabs[1]?.getAttribute('aria-selected'), 'true');
  assert.equal(tabs[1]?.getAttribute('tabindex'), '0');
  assert.equal(tabs[0]?.getAttribute('tabindex'), '-1');
  assert.equal(panel.getAttribute('aria-labelledby'), tabs[1]?.id);

  fireEvent.keyDown(tabs[1]!, { key: 'End' });
  assert.equal(document.activeElement, tabs[3]);
  assert.equal(tabs[3]?.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(tabs[3]!, { key: 'Home' });
  assert.equal(document.activeElement, tabs[0]);
  assert.equal(tabs[0]?.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
  assert.equal(document.activeElement, tabs[3]);
  assert.equal(tabs[3]?.getAttribute('aria-selected'), 'true');
});

test('search modal keeps its mobile controls touch-sized and clear of input text', () => {
  const { getByRole, getByLabelText } = render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {},
      onSearchInApp: () => {},
    }),
  );

  const dialog = getByRole('dialog', { name: 'Buscar hospedagens' });
  const tabs = within(dialog).getAllByRole('tab');
  assert.equal(within(dialog).getByRole('heading', { name: 'Buscar hospedagens' }).tagName, 'H2');
  assert.equal(tabs.length, 4);
  const closeButton = within(dialog).getByRole('button', { name: 'Fechar busca de hospedagens' });
  assert.match(closeButton.className, /top-3/);
  assert.match(closeButton.className, /\[@media\(max-height:400px\)\]:top-0/);
  for (const tab of tabs) {
    assert.match(tab.className, /min-h-11/);
  }

  fireEvent.click(getByRole('tab', { name: 'Datas' }));
  const datesHeading = getByRole('heading', { name: 'Selecione as datas da sua estadia' });
  assert.match(datesHeading.className, /\[@media\(max-height:400px\)\]:sr-only/);
  assert.match(
    datesHeading.parentElement?.className ?? '',
    /\[@media\(max-height:400px\)\]:space-y-3/,
  );
  assert.match(
    getByLabelText('Data de Check-in').parentElement?.parentElement?.parentElement?.className ?? '',
    /\[@media\(max-height:400px\)\]:gap-2/,
  );
  const presets = [
    getByRole('button', { name: /Próximo fim de semana/ }),
    getByRole('button', { name: 'Férias de 5 noites' }),
    getByRole('button', { name: 'Semana completa (7 noites)' }),
  ];
  for (const preset of presets) {
    assert.match(preset.className, /min-h-11/);
  }

  fireEvent.click(getByRole('tab', { name: 'Destino' }));
  const destinationInput = getByLabelText(
    'Buscar por região, cidade ou nome do espaço',
  ) as HTMLInputElement;
  fireEvent.change(destinationInput, { target: { value: 'Caldas Novas' } });
  const clearDestination = getByRole('button', { name: 'Limpar destino' });
  assert.match(clearDestination.className, /h-11 w-11/);
  assert.match(destinationInput.className, /pr-12/);
});

test('searching with dates applies guest filters and requests live availability', () => {
  const searches: AccommodationWidgetSearchParams[] = [];
  const applied: SearchFilters[] = [];
  let closeCount = 0;
  const { getByLabelText, getByRole } = render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {
        closeCount += 1;
      },
      filters: createDefaultSearchFilters(),
      onApplyFilters: (filters: SearchFilters) => applied.push(filters),
      onResetFilters: () => {},
      onSearchInApp: (params: AccommodationWidgetSearchParams) => searches.push(params),
    }),
  );

  fireEvent.click(getByRole('tab', { name: 'Datas' }));
  fireEvent.change(getByLabelText('Data de Check-in'), { target: { value: '2027-05-01' } });
  fireEvent.change(getByLabelText('Data de Check-out'), { target: { value: '2027-05-04' } });
  fireEvent.click(getByRole('button', { name: 'Buscar hospedagens termais' }));

  assert.equal(searches.length, 1);
  assert.deepEqual(searches[0], {
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
    persons: 1,
    guests: { adults: 1, children: 0, infants: 0, pets: 0 },
    destination: '',
    propertyId: '',
  });
  assert.equal(applied.length, 1);
  assert.equal(closeCount, 1);
});

test('resynchronizes destination and dates when external search filters change while open', () => {
  const initialFilters = createDefaultSearchFilters();
  const { getByLabelText, getByRole, rerender } = render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: initialFilters,
      onApplyFilters: () => {},
      onResetFilters: () => {},
      onSearchInApp: () => {},
    }),
  );

  fireEvent.click(getByRole('tab', { name: 'Datas' }));
  fireEvent.change(getByLabelText('Data de Check-in'), { target: { value: '2027-05-10' } });
  fireEvent.change(getByLabelText('Data de Check-out'), { target: { value: '2027-05-12' } });

  const restoredFilters: SearchFilters = {
    ...initialFilters,
    destination: 'Rio Quente',
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
    guests: { adults: 2, children: 1, infants: 1, pets: 1 },
  };
  rerender(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: restoredFilters,
      onApplyFilters: () => {},
      onResetFilters: () => {},
      onSearchInApp: () => {},
    }),
  );

  assert.equal((getByLabelText('Data de Check-in') as HTMLInputElement).value, '2027-05-01');
  assert.equal((getByLabelText('Data de Check-out') as HTMLInputElement).value, '2027-05-04');
  assert.ok(getByRole('tab', { name: 'Hóspedes (4)' }));
  fireEvent.click(getByRole('tab', { name: 'Destino' }));
  assert.equal(
    (getByLabelText('Buscar por região, cidade ou nome do espaço') as HTMLInputElement).value,
    'Rio Quente',
  );
});

test('keeps the search open and explains incomplete or reversed dates', () => {
  let searchCount = 0;
  const { getByLabelText, getByRole, queryByRole } = render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {},
      onSearchInApp: () => {
        searchCount += 1;
      },
    }),
  );

  fireEvent.click(getByRole('tab', { name: 'Datas' }));
  fireEvent.change(getByLabelText('Data de Check-in'), { target: { value: '2027-05-04' } });
  fireEvent.change(getByLabelText('Data de Check-out'), { target: { value: '2027-05-01' } });
  fireEvent.click(getByRole('button', { name: 'Buscar hospedagens termais' }));

  assert.ok(getByRole('alert').textContent?.includes('check-out posterior ao check-in'));
  assert.equal(searchCount, 0);
  assert.ok(queryByRole('dialog', { name: 'Buscar hospedagens' }));
});

test('clearing search dates and guests requests the general catalogue again', () => {
  const searches: AccommodationWidgetSearchParams[] = [];
  let resetCount = 0;
  const { getByRole } = render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {
        resetCount += 1;
      },
      onSearchInApp: (params: AccommodationWidgetSearchParams) => searches.push(params),
    }),
  );

  fireEvent.click(getByRole('button', { name: 'Limpar tudo' }));

  assert.equal(resetCount, 1);
  assert.deepEqual(searches, [
    {
      checkIn: '',
      checkOut: '',
      persons: 1,
      guests: { adults: 1, children: 0, infants: 0, pets: 0 },
      destination: '',
      propertyId: '',
    },
  ]);
});
