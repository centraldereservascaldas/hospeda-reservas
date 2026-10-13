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
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { TripsView } = await import('../src/components/TripsView.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const reservation = {
  id: 'reservation-1',
  code: 'ABC123',
  propertyId: 'JQ08G',
  propertyTitle: 'Apartamento Caldas',
  propertyLocation: 'Caldas Novas',
  propertyImage: 'https://example.test/apartment.jpg',
  checkIn: '10/11/2026',
  checkOut: '15/11/2026',
  nights: 5,
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  pricePerNight: 500,
  cleaningFee: 0,
  serviceFee: 0,
  discount: 0,
  totalAmount: 2500,
  paymentMethod: 'pix' as const,
  status: 'confirmed' as const,
  createdAt: '2026-01-01',
  hostName: 'Central',
  guestName: 'Pessoa Hóspede',
  guestEmail: 'guest@example.test',
  guestPhone: '000000000',
};

test('voucher and cancellation dialogs have names, initial focus, Escape and focus return', () => {
  const { getByRole, getByText, queryByRole } = render(
    React.createElement(TripsView, {
      reservations: [reservation],
      currency: 'BRL',
      onCancelReservation: async () => {},
      onExploreMore: () => {},
    }),
  );

  const voucherTrigger = getByRole('button', { name: 'Voucher' });
  voucherTrigger.focus();
  fireEvent.click(voucherTrigger);
  const voucherDialog = getByRole('dialog', { name: 'Voucher Oficial de Hospedagem' });
  const voucherClose = getByRole('button', { name: 'Fechar voucher' });
  assert.equal(voucherDialog.getAttribute('aria-modal'), 'true');
  assert.equal(document.activeElement, voucherClose);
  fireEvent.click(voucherClose);
  assert.equal(queryByRole('dialog'), null);
  assert.equal(document.activeElement, voucherTrigger);

  const cancelTrigger = getByRole('button', { name: 'Cancelar' });
  cancelTrigger.focus();
  fireEvent.click(cancelTrigger);
  const cancellationDialog = getByRole('dialog', { name: 'Deseja cancelar esta reserva?' });
  const keepTripButton = getByText('Manter viagem');
  assert.equal(cancellationDialog.getAttribute('aria-modal'), 'true');
  assert.equal(
    cancellationDialog.getAttribute('aria-describedby'),
    'cancel-reservation-description',
  );
  assert.equal(document.activeElement, keepTripButton);
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(queryByRole('dialog'), null);
  assert.equal(document.activeElement, cancelTrigger);
});
