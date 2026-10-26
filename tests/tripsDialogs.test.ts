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
const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { TripsView } = await import('../src/components/booking/TripsView.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

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

const cancellationOrder = {
  status: 'cancelamento_solicitado' as const,
  publicReference: '0123456789abcdef0123456789abcdef01234567',
  reservationConfirmed: true,
  listingId: 'JQ08G',
  from: '2026-11-10',
  to: '2026-11-13',
  quoteTotal: '3001.00',
  currency: 'BRL' as const,
  paymentStatus: 'approved',
  expiresAt: null,
  createdAt: '2026-10-26T14:00:00.000Z',
  cancellationReceipt: {
    protocol: 'CANCEL-0123456789abcdef0123456789abcdef01234567',
    requestedAt: '2026-10-26T15:30:00.000Z',
  },
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
  const voucherPrint = getByRole('button', { name: 'Imprimir / Salvar Voucher PDF' });
  assert.equal(voucherDialog.getAttribute('aria-modal'), 'true');
  assert.equal(document.activeElement, voucherClose);
  assert.match(voucherDialog.className, /overflow-y-auto/);
  assert.match(voucherDialog.style.maxHeight, /100dvh/);
  assert.match(voucherDialog.style.maxHeight, /safe-area-inset-bottom/);
  assert.match(voucherDialog.parentElement?.getAttribute('style') || '', /safe-area-inset-top/);
  assert.match(voucherClose.className, /h-11 w-11/);
  assert.match(voucherPrint.className, /min-h-11/);
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
  assert.match(cancellationDialog.className, /overflow-y-auto/);
  assert.match(cancellationDialog.style.maxHeight, /safe-area-inset-top/);
  assert.match(keepTripButton.className, /min-h-11/);
  assert.match(getByRole('button', { name: 'Confirmar cancelamento' }).className, /min-h-11/);
  assert.equal(document.activeElement, keepTripButton);
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(queryByRole('dialog'), null);
  assert.equal(document.activeElement, cancelTrigger);
});

test('retrieved cancellation receipt is labeled received and not completed', () => {
  const { getByText } = render(
    React.createElement(TripsView, {
      reservations: [],
      directBookingOrders: [cancellationOrder],
      accessToken: 'access-token',
      currency: 'BRL',
      onCancelReservation: async () => {},
      onExploreMore: () => {},
    }),
  );

  assert.ok(getByText('Solicitação recebida; o cancelamento ainda não foi concluído.'));
  assert.ok(getByText(/Protocolo CANCEL-0123456789abcdef0123456789abcdef01234567/));
  assert.ok(getByText(/recebido em 26\/10\/2026, 12:30/));
});

test('new cancellation request displays the returned receipt and received status', async () => {
  const originalRequest = crcnBackendApi.requestDirectBookingCancellation;
  crcnBackendApi.requestDirectBookingCancellation = async () => ({
    cancellationReceipt: cancellationOrder.cancellationReceipt,
    alreadyRequested: false,
    message: 'A solicitação de cancelamento foi recebida para análise da Central; o cancelamento ainda não foi concluído.',
  });

  try {
    const { getByRole, getByText } = render(
      React.createElement(TripsView, {
        reservations: [],
        directBookingOrders: [{ ...cancellationOrder, status: 'confirmado', cancellationReceipt: null }],
        accessToken: 'access-token',
        currency: 'BRL',
        onCancelReservation: async () => {},
        onExploreMore: () => {},
      }),
    );

    fireEvent.click(getByRole('button', { name: 'Pedir análise de cancelamento' }));
    fireEvent.click(getByRole('button', { name: 'Enviar solicitação' }));

    await waitFor(() => {
      assert.ok(
        getByText(
          'A solicitação de cancelamento foi recebida para análise da Central; o cancelamento ainda não foi concluído.',
        ),
      );
      assert.equal(
        document.body.textContent?.match(/Protocolo CANCEL-0123456789abcdef0123456789abcdef01234567/g)
          ?.length,
        2,
      );
    });
    assert.equal(document.body.textContent?.includes('A reserva continua ativa'), false);
  } finally {
    crcnBackendApi.requestDirectBookingCancellation = originalRequest;
  }
});
