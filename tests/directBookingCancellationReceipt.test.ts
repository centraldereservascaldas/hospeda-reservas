import assert from 'node:assert/strict';
import test from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { isDirectBookingOrderListItem } from '../src/utils/apiValidation.ts';

const publicReference = '0123456789abcdef0123456789abcdef01234567';
const receipt = {
  protocol: `CANCEL-${publicReference}`,
  requestedAt: '2026-10-26T15:30:00.000Z',
};

test('direct booking list validation accepts a valid cancellation receipt and rejects malformed data', () => {
  const order = {
    status: 'cancelamento_solicitado',
    publicReference,
    reservationConfirmed: true,
    listingId: 'JQ08G',
    from: '2026-11-10',
    to: '2026-11-13',
    quoteTotal: '3001.00',
    currency: 'BRL',
    paymentStatus: 'approved',
    expiresAt: null,
    createdAt: '2026-10-26T14:00:00.000Z',
    cancellationReceipt: receipt,
  };

  assert.equal(isDirectBookingOrderListItem(order), true);
  assert.equal(
    isDirectBookingOrderListItem({ ...order, cancellationReceipt: { ...receipt, protocol: 'bad' } }),
    false,
  );
  assert.equal(isDirectBookingOrderListItem({ ...order, cancellationReceipt: null }), true);
});

test('cancellation request service returns and validates its receipt', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          cancellationStatus: 'requested',
          alreadyRequested: false,
          cancellationReceipt: receipt,
          message: 'A solicitação de cancelamento foi recebida; o cancelamento ainda não foi concluído.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const result = await crcnBackendApi.requestDirectBookingCancellation('access-token', publicReference);
    assert.deepEqual(result, {
      cancellationReceipt: receipt,
      alreadyRequested: false,
      message: 'A solicitação de cancelamento foi recebida; o cancelamento ainda não foi concluído.',
    });

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          cancellationStatus: 'requested',
          alreadyRequested: false,
          cancellationReceipt: { ...receipt, protocol: 'CANCEL-wrong' },
          message: 'Recebido.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    await assert.rejects(
      crcnBackendApi.requestDirectBookingCancellation('access-token', publicReference),
      /Recebido\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
