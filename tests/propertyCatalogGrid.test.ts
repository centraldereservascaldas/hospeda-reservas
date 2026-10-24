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
const { PropertyCatalogGrid } = await import('../src/components/property/PropertyCatalogGrid.tsx');
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
  onClearCatalogFilters: () => {},
  onRetryCatalog: () => {},
};

test('announces catalog loading and errors using status and alert roles', () => {
  const { rerender } = render(
    React.createElement(PropertyCatalogGrid, { ...commonProps, status: 'loading' }),
  );
  assert.match(screen.getByRole('status').textContent || '', /Carregando acomodações/);

  rerender(React.createElement(PropertyCatalogGrid, { ...commonProps, status: 'error' }));
  assert.ok(screen.getByRole('alert'));
  assert.match(screen.getByRole('alert').textContent || '', /Não foi possível carregar/);
  const alert = screen.getByRole('alert');
  assert.match(alert.className, /gap-1/);
  assert.match(alert.className, /sm:gap-3/);
  assert.match(alert.className, /py-4/);
  assert.match(alert.className, /sm:py-12/);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Limpar filtros e ver todas as acomodações' }),
  );
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

test('warns when saved accommodations are stale while keeping cards available', () => {
  let retryCount = 0;
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'stale',
      properties: [STAYS_NET_APARTMENTS[0]!],
      onRetryCatalog: () => {
        retryCount += 1;
      },
    }),
  );

  assert.match(screen.getByRole('alert').textContent || '', /informações salvas/);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar atualizar' }));
  assert.equal(retryCount, 1);
  assert.ok(screen.getByRole('button', { name: 'Ver detalhes de Lacqua DiRoma IV' }));
});

test('exposes the selected gallery photo and keeps gallery controls keyboard visible', () => {
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      properties: [{ ...STAYS_NET_APARTMENTS[0]!, images: ['one.jpg', 'two.jpg'] }],
    }),
  );

  const selector = screen.getByRole('button', { name: 'Mostrar foto 2' });
  assert.match(selector.className, /h-11/);
  assert.match(selector.className, /w-11/);
  assert.match(selector.className, /min-w-11/);
  assert.equal(
    screen.getByRole('button', { name: 'Mostrar foto 1' }).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(selector.getAttribute('aria-pressed'), 'false');
  assert.match(selector.className, /focus-visible:outline/);

  fireEvent.click(selector);
  assert.equal(selector.getAttribute('aria-pressed'), 'true');
  assert.equal(
    screen.getByRole('button', { name: 'Mostrar foto 1' }).getAttribute('aria-pressed'),
    'false',
  );
});

test('keeps amenities out of the card and labels an unquoted nightly price as a reference', () => {
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      showTotalWithTaxes: false,
      properties: [
        {
          ...STAYS_NET_APARTMENTS[0]!,
          amenities: [' Wi-Fi ', '', 'Wi-Fi', 'Piscina', 'Cozinha', 'Ar-condicionado'],
          listingAmenities: [],
          propertyAmenities: [],
          pricePerNight: 245,
          calculatedPrice: undefined,
        },
      ],
    }),
  );

  assert.equal(screen.queryByText('Wi-Fi'), null);
  assert.equal(screen.queryByText('Piscina'), null);
  assert.equal(screen.queryByText('Cozinha'), null);
  assert.ok(screen.getByText(/Tarifa de referência; total depende das datas/));
  assert.equal(screen.queryByText('Piscinas'), null);
  assert.equal(screen.queryByText('Parque aquático'), null);
});

test('keeps the catalog card concise when the amenity summary is empty', () => {
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      properties: [
        {
          ...STAYS_NET_APARTMENTS[0]!,
          amenities: [' ', ''],
          listingAmenities: ['Wi-Fi de alta velocidade', 'Cozinha equipada'],
          propertyAmenities: ['Piscinas termais'],
        },
      ],
    }),
  );

  assert.equal(screen.queryByRole('list', { name: 'Comodidades de Lacqua DiRoma IV' }), null);
  assert.equal(screen.queryByText('Wi-Fi de alta velocidade'), null);
});

test('does not present a catalogue nightly rate as a quote for selected dates', () => {
  const { getByRole } = render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      hasSearchDates: true,
      properties: [{ ...STAYS_NET_APARTMENTS[0]!, calculatedPrice: undefined }],
    }),
  );

  assert.ok(screen.getByText('Preço ainda não confirmado para esse período'));
  const detailsButton = getByRole('button', { name: 'Ver detalhes de Lacqua DiRoma IV' });
  const priceDescriptionId = detailsButton.getAttribute('aria-describedby');
  assert.ok(priceDescriptionId);
  assert.match(
    document.getElementById(priceDescriptionId)?.textContent || '',
    /Preço ainda não confirmado/,
  );
});

test('shows the confirmed stay total before its nightly rate in a property card', () => {
  const { getByRole } = render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      hasSearchDates: true,
      showTotalWithTaxes: true,
      properties: [
        {
          ...STAYS_NET_APARTMENTS[0]!,
          calculatedPrice: {
            nights: 2,
            dailyRate: 250,
            basePrice: 500,
            cleaningFee: 50,
            serviceFee: 0,
            totalAmount: 550,
            currency: 'BRL',
          },
        },
      ],
    }),
  );

  const detailsButton = getByRole('button', { name: 'Ver detalhes de Lacqua DiRoma IV' });
  const priceDescriptionId = detailsButton.getAttribute('aria-describedby');
  assert.ok(priceDescriptionId);
  assert.match(document.getElementById(priceDescriptionId)?.textContent || '', /Total da estadia/);
  assert.match(document.getElementById(priceDescriptionId)?.textContent || '', /550,00/);
  assert.match(document.getElementById(priceDescriptionId)?.textContent || '', /250,00 por noite/);
});

test('does not reuse a dated quote as a general price after search dates are cleared', () => {
  render(
    React.createElement(PropertyCatalogGrid, {
      ...commonProps,
      status: 'ready',
      hasSearchDates: false,
      properties: [
        {
          ...STAYS_NET_APARTMENTS[0]!,
          calculatedPrice: {
            nights: 2,
            dailyRate: 250,
            basePrice: 500,
            cleaningFee: 50,
            serviceFee: 0,
            totalAmount: 550,
            currency: 'BRL',
          },
        },
      ],
    }),
  );

  assert.ok(screen.getByText('Selecione as datas para consultar o preço atualizado'));
  assert.equal(screen.queryByText(/total com taxas/), null);
  assert.equal(screen.queryByText(/Tarifa de referência/), null);
});
