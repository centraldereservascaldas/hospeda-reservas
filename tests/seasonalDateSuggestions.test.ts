import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { ComponentProps } from 'react';

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
const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { SeasonalDateSuggestions, formatPeriod } =
  await import('../src/components/search/SeasonalDateSuggestions.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const { STAYS_NET_APARTMENTS } = await import('../src/data/staysApartments.ts');
const originalSearch = crcnBackendApi.searchAccommodationsPage;
const originalCatalog = crcnBackendApi.getAccommodations;

function property(id: string, title: string, category: string) {
  return {
    ...STAYS_NET_APARTMENTS[0]!,
    id,
    staysListingId: id,
    title,
    category,
    images: ['https://crcn.stays.net/image/6a356fe93db977efbea5a948'],
  };
}

function createElement(props: Partial<ComponentProps<typeof SeasonalDateSuggestions>> = {}) {
  return React.createElement(SeasonalDateSuggestions, {
    guestCount: 2,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    fallbackProperties: [
      property('listing-b', 'Apartamento B', 'pet_friendly'),
      property('listing-a', 'Apartamento A', 'pet_friendly'),
    ],
    onOpenProperty: () => {},
    ...props,
  });
}

test.afterEach(() => {
  cleanup();
  crcnBackendApi.searchAccommodationsPage = originalSearch;
  crcnBackendApi.getAccommodations = originalCatalog;
});

test('renders stable catalog cards without background quote or catalog requests', () => {
  let searchCalls = 0;
  let catalogCalls = 0;
  crcnBackendApi.searchAccommodationsPage = async () => {
    searchCalls += 1;
    throw new Error('seasonal cards must not automatically quote');
  };
  crcnBackendApi.getAccommodations = async () => {
    catalogCalls += 1;
    throw new Error('seasonal cards must use the already loaded catalog');
  };

  const view = render(createElement());

  assert.ok(screen.getByRole('heading', { name: 'Hospedagens para viajar com seu pet' }));
  assert.ok(screen.getByRole('heading', { name: 'Datas comemorativas e feriados' }));
  assert.ok(screen.getAllByRole('img').length > 0);
  assert.equal(screen.getAllByText('Consultar preço final e disponibilidade').length > 0, true);
  assert.doesNotMatch(document.body.textContent || '', /consultando preço|R\$\s?\d/iu);
  assert.equal(searchCalls, 0);
  assert.equal(catalogCalls, 0);

  const before = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
  view.rerender(
    createElement({
      fallbackProperties: [
        property('listing-a', 'Apartamento A', 'pet_friendly'),
        property('listing-b', 'Apartamento B', 'pet_friendly'),
      ],
    }),
  );
  const after = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
  assert.deepEqual(after, before);
  assert.equal(searchCalls, 0);
});

test('seasonal pet card opens the displayed pet-friendly property with dates and guests', () => {
  const selections: Array<{ propertyId: string; checkIn: string; checkOut: string; pets: number }> =
    [];
  const accepting = property('listing-a', 'Apartamento A', 'pet_friendly');
  const rejecting = {
    ...property('listing-b', 'Apartamento B', 'family_friendly'),
    description: 'Não aceita animais',
  };
  render(
    createElement({
      guests: { adults: 2, children: 1, infants: 0, pets: 0 },
      fallbackProperties: [accepting, rejecting],
      onOpenProperty: (selected, params) => {
        selections.push({
          propertyId: selected.id,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          pets: params.guests?.pets ?? 0,
        });
      },
    }),
  );

  const section = screen
    .getByRole('heading', { name: 'Hospedagens para viajar com seu pet' })
    .closest('section')!;
  assert.doesNotMatch(section.textContent || '', /Apartamento B/);
  const card = Array.from(section.querySelectorAll('button')).find((button) =>
    button.getAttribute('aria-label')?.includes('Apartamento A'),
  )!;
  fireEvent.click(card);
  assert.equal(selections.length, 1);
  assert.equal(selections[0]!.propertyId, 'listing-a');
  assert.ok(selections[0]!.checkOut > selections[0]!.checkIn);
  assert.equal(selections[0]!.pets, 1);
  assert.match(card.getAttribute('aria-label') || '', /\b20\d{2}\b/);
});

test('seasonal date labels distinguish years, including a stay across New Year', () => {
  assert.match(formatPeriod({ checkIn: '2027-11-19', checkOut: '2027-11-22' }), /2027/);
  const acrossYears = formatPeriod({ checkIn: '2026-12-31', checkOut: '2027-01-03' });
  assert.match(acrossYears, /2026/);
  assert.match(acrossYears, /2027/);
});

test('shows only a fresh quote belonging to the displayed property and dates', async () => {
  const previous = globalThis.IntersectionObserver;
  class VisibleObserver {
    constructor(private callback: ConstructorParameters<typeof IntersectionObserver>[0]) {}
    observe(element: Element) {
      queueMicrotask(() =>
        this.callback(
          [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      );
    }
    disconnect() {}
  }
  globalThis.IntersectionObserver = VisibleObserver as unknown as typeof IntersectionObserver;
  const expiresAt = Date.now() + 60_000;
  crcnBackendApi.searchAccommodationsPage = async (params) => ({
    expiresAt,
    total: 1,
    unquotedCount: 0,
    pagination: { receivedCount: 1, nextSkip: 1, hasMore: false },
    data: [
      {
        ...property('listing-a', 'Apartamento A', 'pet_friendly'),
        calculatedPrice: {
          totalAmount: 450,
          dailyRate: 225,
          basePrice: 450,
          cleaningFee: 0,
          serviceFee: 0,
          nights: Math.round((Date.parse(params.to!) - Date.parse(params.from!)) / 86_400_000),
          currency: 'BRL',
          expiresAt,
        },
      },
    ],
  });
  try {
    render(createElement());
    assert.ok((await screen.findAllByText(/R\$\s?450,00 na hospedagem/)).length > 0);
    assert.ok(screen.getAllByText(/consulte taxa para pet/).length > 0);
    const other = screen
      .getAllByRole('button')
      .find((item) => item.getAttribute('aria-label')?.includes('Apartamento B'))!;
    assert.doesNotMatch(other.textContent || '', /R\$\s?450,00/);
  } finally {
    cleanup();
    globalThis.IntersectionObserver = previous;
  }
});

test('offers horizontal carousel controls on desktop and mobile carousels keep a centered inset', () => {
  render(createElement());
  assert.ok(screen.getAllByRole('button', { name: 'Ver opções anteriores' }).length > 0);
  assert.ok(screen.getAllByRole('button', { name: 'Ver mais opções' }).length > 0);
  assert.ok(document.querySelector('.snap-center'));
  assert.ok(document.querySelector('.overflow-x-auto.px-4'));
  assert.ok(document.querySelector('img[fetchpriority="high"]'));
});
