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
