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
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { SeasonalDateSuggestions } =
  await import('../src/components/search/SeasonalDateSuggestions.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const { STAYS_NET_APARTMENTS } = await import('../src/data/staysApartments.ts');

const originalSearch = crcnBackendApi.searchAccommodations;

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  crcnBackendApi.searchAccommodations = originalSearch;
});

test('shows date suggestions with real quoted totals and applies the selected period', async () => {
  crcnBackendApi.searchAccommodations = async () => ({
    total: 1,
    data: [
      {
        ...STAYS_NET_APARTMENTS[0]!,
        calculatedPrice: {
          nights: 2,
          dailyRate: 600,
          basePrice: 1200,
          cleaningFee: 0,
          serviceFee: 0,
          totalAmount: 1200,
          currency: 'BRL',
        },
      },
    ],
  });
  const selections: Array<{ checkIn: string; checkOut: string }> = [];

  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: (params) => {
        selections.push({ checkIn: params.checkIn, checkOut: params.checkOut });
      },
    }),
  );

  assert.ok(screen.getByRole('heading', { name: 'Hospedagens para viajar com seu pet' }));
  assert.ok(screen.getByRole('heading', { name: 'Caldas Country Festival' }));
  assert.ok(screen.getByRole('heading', { name: 'Datas comemorativas e feriados' }));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 1.200,00').length > 0));
  assert.ok(screen.getAllByRole('img').length > 0);
  const firstSuggestion = screen.getAllByRole('button', { name: /a partir de.*1\.200,00/i })[0]!;
  fireEvent.click(firstSuggestion);

  const selected = selections[0];
  assert.ok(selected);
  assert.ok(selected.checkOut > selected.checkIn);
});

test('keeps a consultation failure separate from no availability and never caches it', async () => {
  crcnBackendApi.searchAccommodations = async () => {
    throw new Error('offline');
  };
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  await waitFor(() =>
    assert.ok(screen.getAllByText('Consulta indisponível. Tente buscar.').length > 0),
  );
  assert.equal(window.sessionStorage.length, 0);
  assert.doesNotMatch(document.body.textContent || '', /Nenhuma acomodação disponível|R\$/);
});

test('does not use a neighbouring apartment quote for another unit of the same condominium', async () => {
  const unitA = {
    ...STAYS_NET_APARTMENTS[0]!,
    id: 'unit-a',
    title: 'Apartamento A',
    staysListingId: 'unit-a',
    staysPropertyId: 'same-complex',
    maxGuests: 4,
  };
  const unitB = { ...unitA, id: 'unit-b', title: 'Apartamento B', staysListingId: 'unit-b' };
  crcnBackendApi.searchAccommodations = async (params) => ({
    total: 1,
    data: params.from
      ? [
          {
            ...unitA,
            calculatedPrice: {
              nights: Math.round((Date.parse(params.to!) - Date.parse(params.from)) / 86400000),
              dailyRate: 250,
              basePrice: 500,
              cleaningFee: 0,
              serviceFee: 0,
              totalAmount: 500,
              currency: 'BRL',
            },
          },
        ]
      : [unitB],
  });
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      fallbackProperties: [unitB],
      onSelect: () => {},
    }),
  );
  await waitFor(() =>
    assert.ok(screen.getAllByRole('button', { name: /Apartamento B/ }).length > 0),
  );
  for (const button of screen.getAllByRole('button', { name: /Apartamento B/ })) {
    assert.doesNotMatch(button.textContent || '', /R\$/);
    assert.match(button.getAttribute('aria-label') || '', /sugestão de hospedagem/);
  }
});

test('hides quotes from a previous occupancy while the new search is pending', async () => {
  crcnBackendApi.searchAccommodations = async (params) => {
    if (params.guests === 3) return new Promise(() => {});
    return {
      total: 1,
      data: [
        {
          ...STAYS_NET_APARTMENTS[0]!,
          calculatedPrice: {
            nights:
              params.from && params.to
                ? Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000)
                : 2,
            dailyRate: 250,
            basePrice: 500,
            cleaningFee: 0,
            serviceFee: 0,
            totalAmount: 500,
            currency: 'BRL',
          },
        },
      ],
    };
  };
  const props = {
    currency: 'BRL' as const,
    guestCount: 2,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    onSelect: () => {},
  };
  const view = render(React.createElement(SeasonalDateSuggestions, props));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  view.rerender(
    React.createElement(SeasonalDateSuggestions, {
      ...props,
      guestCount: 3,
      guests: { ...props.guests, adults: 3 },
    }),
  );
  assert.doesNotMatch(document.body.textContent || '', /R\$ 500/);
});

test('does not restore an expired price as a confirmed offer on the next visit', async () => {
  const now = Date.now;
  crcnBackendApi.searchAccommodations = async (params) => ({
    total: 1,
    data: [
      {
        ...STAYS_NET_APARTMENTS[0]!,
        calculatedPrice: {
          nights:
            params.from && params.to
              ? Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000)
              : 2,
          dailyRate: 250,
          basePrice: 500,
          cleaningFee: 0,
          serviceFee: 0,
          totalAmount: 500,
          currency: 'BRL',
        },
      },
    ],
  });
  const props = {
    currency: 'BRL' as const,
    guestCount: 2,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
    onSelect: () => {},
  };
  const view = render(React.createElement(SeasonalDateSuggestions, props));
  await waitFor(() => assert.ok(screen.getAllByText('R$ 500,00').length > 0));
  view.unmount();
  try {
    const expiredNow = now() + 46_000;
    Date.now = () => expiredNow;
    crcnBackendApi.searchAccommodations = async () => new Promise(() => {});
    render(React.createElement(SeasonalDateSuggestions, props));
    assert.doesNotMatch(document.body.textContent || '', /R\$ 500/);
  } finally {
    Date.now = now;
  }
});

test('prioritizes only the first collection cover and supplies responsive image variants', async () => {
  crcnBackendApi.searchAccommodations = async (params) => ({
    total: 1,
    data: [
      {
        ...STAYS_NET_APARTMENTS[0]!,
        images: ['https://crcn.stays.net/image/6a356fe93db977efbea5a948'],
        calculatedPrice: {
          nights:
            params.from && params.to
              ? Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000)
              : 2,
          dailyRate: 250,
          basePrice: 500,
          cleaningFee: 0,
          serviceFee: 0,
          totalAmount: 500,
          currency: 'BRL',
        },
      },
    ],
  });
  render(
    React.createElement(SeasonalDateSuggestions, {
      currency: 'BRL',
      guestCount: 2,
      guests: { adults: 2, children: 0, infants: 0, pets: 0 },
      onSelect: () => {},
    }),
  );
  await waitFor(() => assert.ok(document.querySelector('img[fetchpriority="high"]')));
  const primary = document.querySelector('img[fetchpriority="high"]')!;
  assert.equal(primary.getAttribute('loading'), 'eager');
  assert.match(primary.getAttribute('srcset') || '', /640w/);
  assert.equal(document.querySelectorAll('img[fetchpriority="high"]').length, 1);
  assert.ok(document.querySelectorAll('img[loading="lazy"]').length > 0);
});
