import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { formatCurrency } from '../src/utils/formatters.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
let observedMapSize = { width: 640, height: 480 };
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

class ResizeObserverStub {
  constructor(
    private readonly callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void,
  ) {}

  observe(target: Element) {
    this.callback(
      [{ contentRect: observedMapSize, target } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
}

Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

const React = (await import('react')).default;
const { render, cleanup, fireEvent, screen, waitFor } = await import('@testing-library/react');
const { InteractiveMap } = await import('../src/components/location/InteractiveMap.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  observedMapSize = { width: 640, height: 480 };
});

const property = {
  ...STAYS_NET_APARTMENTS[0]!,
  location: { ...STAYS_NET_APARTMENTS[0]!.location, lat: -17.744, lng: -48.625 },
  calculatedPrice: {
    nights: 2,
    dailyRate: 250,
    basePrice: 500,
    cleaningFee: 50,
    serviceFee: 0,
    totalAmount: 550,
    currency: 'BRL',
  },
};

test('map pins and selected listing use the same date quote as property cards', async () => {
  const props = {
    properties: [property],
    currency: 'BRL' as const,
    hasSearchDates: true,
    showTotalWithTaxes: false,
    onSelectProperty: () => {},
    selectedProperty: null,
  };
  const { rerender } = render(React.createElement(InteractiveMap, props));

  const pin = await waitFor(() => {
    const matchingPin = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes(formatCurrency(250, 'BRL')));
    assert.ok(matchingPin);
    return matchingPin;
  });
  assert.match(pin.getAttribute('aria-label') || '', /\/ noite/);
  assert.ok(pin.textContent?.includes(formatCurrency(250, 'BRL')));
  fireEvent.click(pin);
  const selectedListingDetails = screen.getByRole('button', { name: 'Ver detalhes' });
  assert.ok(selectedListingDetails.parentElement?.textContent?.includes('250,00'));

  rerender(React.createElement(InteractiveMap, { ...props, showTotalWithTaxes: true }));
  await waitFor(() => {
    assert.ok(selectedListingDetails.parentElement?.textContent?.includes('550,00'));
  });
  assert.match(
    selectedListingDetails.parentElement?.textContent || '',
    /Total da estadia • 2 noites/,
  );
});

test('selected map listing shows the same recorded amenity summary as property cards', async () => {
  const listingWithAmenities = {
    ...property,
    amenities: ['Wi-Fi', 'Piscina', 'Cozinha', 'Ar-condicionado'],
    listingAmenities: [],
    propertyAmenities: [],
  };
  render(
    React.createElement(InteractiveMap, {
      properties: [listingWithAmenities],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const pin = await screen.findByRole('button', { name: /250,00/ });
  fireEvent.click(pin);

  const amenities = screen.getByRole('list', { name: /Comodidades de/ });
  assert.match(amenities.textContent || '', /Wi-Fi.*Piscina.*Cozinha.*mais 1/);
});

test('selected map listing falls back to apartment and condominium amenities', async () => {
  const listingWithSplitAmenities = {
    ...property,
    amenities: [],
    listingAmenities: ['Internet Wi-Fi', 'Ar-condicionado'],
    propertyAmenities: ['Piscina', 'Sauna'],
  };
  render(
    React.createElement(InteractiveMap, {
      properties: [listingWithSplitAmenities],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  fireEvent.click(await screen.findByRole('button', { name: /250,00/ }));

  const amenities = screen.getByRole('list', { name: /Comodidades de/ });
  assert.match(amenities.textContent || '', /Internet Wi-Fi.*Ar-condicionado.*Piscina.*mais 1/);
});

test('map does not present the reference rate for dates without a confirmed quote', async () => {
  const withoutQuote = { ...property, calculatedPrice: undefined };
  render(
    React.createElement(InteractiveMap, {
      properties: [withoutQuote],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const pin = await screen.findByRole('button', {
    name: /Preço ainda não confirmado para esse período/,
  });
  assert.equal(pin.textContent, 'Consultar');
});

test('map closes the selected listing when it no longer matches the filtered results', async () => {
  const props = {
    properties: [property],
    currency: 'BRL' as const,
    hasSearchDates: true,
    showTotalWithTaxes: false,
    onSelectProperty: () => {},
    selectedProperty: null,
  };
  const { queryByRole, rerender } = render(React.createElement(InteractiveMap, props));

  fireEvent.click(await screen.findByRole('button', { name: /250,00/ }));
  assert.ok(screen.getByRole('button', { name: 'Fechar detalhes do marcador' }));
  assert.ok(screen.getByRole('button', { name: 'Ver detalhes' }));
  const details = screen.getByRole('region', { name: property.title });
  assert.match(details.className, /max-\[639px\]:max-h-/);
  assert.match(details.className, /max-\[639px\]:overflow-y-auto/);
  assert.match(
    details.querySelector('img')?.parentElement?.className || '',
    /\[@media\(max-height:400px\)\]:hidden/,
  );
  assert.match(
    screen.getByRole('button', { name: 'Fechar detalhes do marcador' }).className,
    /h-11 w-11/,
  );

  rerender(React.createElement(InteractiveMap, { ...props, properties: [] }));

  await waitFor(() => {
    assert.equal(queryByRole('button', { name: 'Fechar detalhes do marcador' }), null);
    assert.equal(queryByRole('button', { name: 'Ver detalhes' }), null);
  });
});

test('map canvas and controls expose a visible keyboard focus indicator', async () => {
  render(
    React.createElement(InteractiveMap, {
      properties: [property],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const map = screen.getByRole('application', { name: 'Mapa interativo das acomodações' });
  assert.match(map.className, /focus-visible:outline/);
  assert.ok(map.className.includes('[@media(max-width:639px)_and_(max-height:400px)]:h-[145px]'));
  assert.ok(screen.getByRole('status', { name: '1 acomodação no mapa' }));
  for (const label of ['Aumentar zoom', 'Diminuir zoom', 'Enquadrar acomodações', 'Abrir mapa']) {
    assert.match(screen.getByRole('button', { name: label }).className, /focus-visible:outline/);
  }

  const pin = await screen.findByRole('button', { name: /250,00/ });
  fireEvent.click(pin);
  assert.match(
    screen.getByRole('button', { name: 'Fechar detalhes do marcador' }).className,
    /focus-visible:outline/,
  );
});

test('compact landscape map spaces up to six price markers away from fixed controls', async () => {
  observedMapSize = { width: 304, height: 145 };
  const compactProperties = [
    property,
    { ...property, id: 'compact-2', location: { ...property.location, lat: -17.75 } },
    { ...property, id: 'compact-3', location: { ...property.location, lng: -48.61 } },
  ];

  const { rerender } = render(
    React.createElement(InteractiveMap, {
      properties: compactProperties,
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const pins = await screen.findAllByRole('button', { name: /250,00/ });
  assert.equal(pins.length, 3);
  const centers = pins.map((pin) => Number.parseFloat(pin.style.left));
  assert.deepEqual(centers, [44, 152, 260]);
  assert.ok(pins.every((pin) => Number.parseFloat(pin.style.top) === 75.4));
  assert.ok(pins.every((pin) => pin.getAttribute('aria-label')?.includes('/ noite')));
  assert.ok(pins.every((pin) => pin.className.includes('text-[10px]')));
  assert.ok(pins.every((pin) => Number.parseFloat(pin.style.width) === 72));
  const topControls = screen.getByRole('button', { name: 'Aumentar zoom' }).parentElement;
  assert.match(topControls?.className || '', /\]:top-0/);
  assert.match(screen.getByRole('button', { name: 'Abrir mapa' }).className, /\]:bottom-0/);
  assert.ok(Math.abs(Number.parseFloat(pins[0]!.style.top) - 22 - 53.4) < 0.01);
  assert.ok(Math.abs(Number.parseFloat(pins[0]!.style.top) + 22 - 97.4) < 0.01);
  assert.equal(145 - 44, 101);

  const sixProperties = Array.from({ length: 6 }, (_, index) => ({
    ...property,
    id: `compact-${index + 1}`,
    location: { ...property.location, lat: property.location.lat + index * 0.001 },
  }));
  rerender(
    React.createElement(InteractiveMap, {
      properties: sixProperties,
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );
  const sixPins = await screen.findAllByRole('button', { name: /250,00/ });
  const sixCenters = sixPins.map((pin) => Number.parseFloat(pin.style.left));
  assert.equal(sixPins.length, 6);
  assert.ok(sixPins.every((pin) => Number.parseFloat(pin.style.width) === 44));
  assert.ok(sixCenters.slice(1).every((center, index) => center - sixCenters[index]! >= 44));

  cleanup();
  observedMapSize = { width: 552, height: 145 };
  render(
    React.createElement(InteractiveMap, {
      properties: compactProperties,
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );
  const landscapePins = await screen.findAllByRole('button', { name: /250,00/ });
  const landscapeCenters = landscapePins.map((pin) => Number.parseFloat(pin.style.left));
  assert.deepEqual(landscapeCenters, [76, 276, 476]);
  assert.ok(landscapePins.every((pin) => Number.parseFloat(pin.style.width) === 136));
  assert.ok(landscapePins.every((pin) => Number.parseFloat(pin.style.top) === 75.4));
  assert.match(
    screen.getByRole('button', { name: 'Abrir mapa' }).className,
    /\[@media\(max-width:639px\)_and_\(max-height:400px\)\]:bottom-0/,
  );
  assert.match(
    screen.getByRole('link', { name: /OpenStreetMap/ }).parentElement?.className || '',
    /\[@media\(max-width:639px\)_and_\(max-height:400px\)\]:bottom-0/,
  );
});

test('map explains when search results have no usable coordinates', async () => {
  const propertyWithoutCoordinates = {
    ...property,
    location: { ...property.location, lat: Number.NaN, lng: Number.NaN },
  };
  render(
    React.createElement(InteractiveMap, {
      properties: [propertyWithoutCoordinates],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const noCoordinateNotice = await screen.findByText(/estes imóveis não têm coordenadas/i);
  assert.match(
    noCoordinateNotice.textContent || '',
    /não têm coordenadas para aparecer no mapa.*Ver Lista/i,
  );
  assert.equal(screen.queryByRole('button', { name: 'Mostrar todos no mapa' }), null);
});

test('arrow keys pan only when the map canvas itself is focused', async () => {
  render(
    React.createElement(InteractiveMap, {
      properties: [property],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const map = screen.getByRole('application', { name: 'Mapa interativo das acomodações' });
  assert.match(map.getAttribute('aria-describedby') || '', /accommodation-map-keyboard-help/);
  const pin = await screen.findByRole('button', { name: /250,00/ });
  const initialPinPosition = pin.getAttribute('style');

  fireEvent.keyDown(pin, { key: 'ArrowRight' });
  assert.equal(pin.getAttribute('style'), initialPinPosition);

  fireEvent.keyDown(map, { key: 'ArrowRight' });
  assert.notEqual(pin.getAttribute('style'), initialPinPosition);
});

test('dragging the map pans it without activating an accommodation pin', async () => {
  render(
    React.createElement(InteractiveMap, {
      properties: [property],
      currency: 'BRL',
      hasSearchDates: true,
      showTotalWithTaxes: false,
      onSelectProperty: () => {},
      selectedProperty: null,
    }),
  );

  const map = screen.getByRole('application', { name: 'Mapa interativo das acomodações' });
  const pin = await screen.findByRole('button', { name: /250,00/ });
  const initialPinPosition = pin.getAttribute('style');
  Object.defineProperty(map, 'setPointerCapture', { value: () => {} });

  fireEvent.pointerDown(map, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(map, { pointerId: 1, clientX: 130, clientY: 112 });
  fireEvent.pointerUp(map, { pointerId: 1 });

  await waitFor(() => {
    assert.notEqual(pin.getAttribute('style'), initialPinPosition);
  });
  assert.equal(screen.queryByRole('button', { name: 'Ver detalhes' }), null);
});
