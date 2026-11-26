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
const { SeasonalDateSuggestions } =
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
    onSelect: () => {},
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

  const before = screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));
  view.rerender(
    createElement({
      fallbackProperties: [
        property('listing-a', 'Apartamento A', 'pet_friendly'),
        property('listing-b', 'Apartamento B', 'pet_friendly'),
      ],
    }),
  );
  const after = screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));
  assert.deepEqual(after, before);
  assert.equal(searchCalls, 0);
});

test('selecting a seasonal card passes its future dates and guest details to the existing search flow', () => {
  const selections: Array<{
    checkIn: string;
    checkOut: string;
    persons?: number;
    guests?: { adults?: number; pets?: number };
  }> = [];
  render(createElement({
    guests: { adults: 2, children: 1, infants: 0, pets: 0 },
    onSelect: (params) => {
      selections.push(params);
    },
  }));

  fireEvent.click(screen.getAllByRole('button', { name: /Apartamento A.*ACEITA PET|Apartamento A.*Fim de semana com seu pet/i })[0]!);

  assert.equal(selections.length, 1);
  assert.ok(selections[0]!.checkIn >= new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  assert.ok(selections[0]!.checkOut > selections[0]!.checkIn);
  assert.equal(selections[0]!.persons, 2);
  assert.equal(selections[0]!.guests?.adults, 2);
  assert.equal(selections[0]!.guests?.pets, 1);
});

test('offers horizontal carousel controls on desktop and mobile carousels keep a centered inset', () => {
  render(createElement());
  assert.ok(screen.getAllByRole('button', { name: 'Ver opções anteriores' }).length > 0);
  assert.ok(screen.getAllByRole('button', { name: 'Ver mais opções' }).length > 0);
  assert.ok(document.querySelector('.snap-center'));
  assert.ok(document.querySelector('.overflow-x-auto.px-4'));
  assert.ok(document.querySelector('img[fetchpriority="high"]'));
});
