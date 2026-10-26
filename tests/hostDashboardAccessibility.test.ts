import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import type { OwnerDashboardData } from '../src/services/crcnBackendApi.ts';
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
const { render, fireEvent, cleanup, waitFor, within } = await import('@testing-library/react');
const { HostDashboardView } = await import('../src/components/owner/HostDashboardView.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('owner dashboard exposes the selected section and announces loading', () => {
  const originalGetOwnerDashboard = crcnBackendApi.getOwnerDashboard;
  crcnBackendApi.getOwnerDashboard = async () => new Promise(() => {});
  try {
    const { getByRole } = render(
      React.createElement(HostDashboardView, { accessToken: 'test-token' }),
    );

    const navigation = getByRole('navigation', { name: 'Seções do painel do proprietário' });
    const overview = getByRole('button', { name: 'Visão geral' });
    const calendar = getByRole('button', { name: 'Calendário' });
    const loading = getByRole('status');

    assert.ok(navigation);
    assert.equal(overview.getAttribute('aria-current'), 'page');
    assert.equal(loading.textContent, 'Carregando dados da Stays…');
    assert.equal(loading.getAttribute('aria-live'), 'polite');

    fireEvent.click(calendar);
    assert.equal(calendar.getAttribute('aria-current'), 'page');
    assert.equal(overview.hasAttribute('aria-current'), false);
  } finally {
    crcnBackendApi.getOwnerDashboard = originalGetOwnerDashboard;
  }
});

test('owner property selector filters dashboard reservations and accounting by listing', async () => {
  const originalGetOwnerDashboard = crcnBackendApi.getOwnerDashboard;
  const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const reservations: OwnerDashboardData['reservations'] = [
    { id: 'reservation-1', code: 'R1', listingId: 'listing-1', propertyTitle: 'Apartamento 1', propertyImage: '', guestName: 'Hóspede da unidade 1', checkIn, checkOut, status: 'confirmed', paymentStatus: 'paid', total: 100, currency: 'BRL', nights: 1 },
    { id: 'reservation-2', code: 'R2', listingId: 'listing-2', propertyTitle: 'Apartamento 2', propertyImage: '', guestName: 'Hóspede da unidade 2', checkIn, checkOut, status: 'confirmed', paymentStatus: 'paid', total: 200, currency: 'BRL', nights: 1 },
  ];
  const dashboard: OwnerDashboardData = {
    period: { from: '2026-10-01', to: '2026-10-31' },
    ownerName: 'Proprietário',
    totals: { debit: 550, credit: 110 },
    properties: [
      { staysListingId: 'listing-1', title: 'Apartamento 1', image: '', debit: 500, credit: 100 },
      { staysListingId: 'listing-2', title: 'Apartamento 2', image: '', debit: 50, credit: 10 },
    ],
    reservations,
    entries: [],
  };
  crcnBackendApi.getOwnerDashboard = async () => dashboard;

  try {
    const { getByRole, getByText, getAllByText, queryByText, queryByRole, getAllByLabelText, queryByLabelText } = render(
      React.createElement(HostDashboardView, { accessToken: 'test-token' }),
    );
    await waitFor(() => getByText('Hóspede da unidade 1'));
    assert.equal(queryByText('Hóspede da unidade 2') !== null, true);
    assert.equal(queryByText('Filtrar propriedades') !== null, false);
    assert.equal(queryByRole('combobox', { name: 'Filtrar propriedades' }), null);
    fireEvent.click(getByRole('button', { name: 'Minhas propriedades' }));
    assert.equal(queryByRole('combobox', { name: 'Filtrar propriedades' }), null);

    fireEvent.click(getByRole('button', { name: 'Reservas feitas' }));
    const propertyFilter = getByRole('combobox', { name: 'Filtrar propriedades' });

    assert.equal((propertyFilter as HTMLSelectElement).options.length, 3);
    assert.ok(getByText('Hóspede da unidade 1'));
    assert.ok(getByText('Hóspede da unidade 2'));
    fireEvent.change(propertyFilter, { target: { value: 'listing-2' } });

    assert.ok(getByText('Hóspede da unidade 2'));
    assert.equal(queryByText('Hóspede da unidade 1'), null);
    fireEvent.click(getByRole('button', { name: 'Contabilidade' }));
    assert.ok(getByRole('combobox', { name: 'Filtrar propriedades' }));
    const table = getByRole('table');
    assert.ok(within(table).getByText('Apartamento 2'));
    assert.equal(within(table).queryByText('Apartamento 1'), null);
    assert.ok(getAllByText('R$ 10,00').length > 0);
    assert.ok(getAllByText('R$ 50,00').length > 0);

    fireEvent.click(getByRole('button', { name: 'Calendário' }));
    assert.equal(queryByRole('combobox', { name: 'Filtrar propriedades' }), null);
    const blockProperty = getByRole('combobox', { name: 'Propriedade' });
    assert.equal((blockProperty as HTMLSelectElement).value, 'listing-1');
    assert.ok(getAllByLabelText(/Apartamento 1 ·/).length > 0);
    assert.equal(queryByLabelText(/Apartamento 2 ·/), null);

    fireEvent.change(blockProperty, { target: { value: 'listing-2' } });
    assert.ok(getAllByLabelText(/Apartamento 2 ·/).length > 0);
    assert.equal(queryByLabelText(/Apartamento 1 ·/), null);
  } finally {
    crcnBackendApi.getOwnerDashboard = originalGetOwnerDashboard;
  }
});
