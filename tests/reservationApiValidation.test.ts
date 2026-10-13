import assert from 'node:assert/strict';
import test from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';

const reservation = {
  id: 'reservation-1',
  code: 'reservation-1',
  propertyId: 'JQ08G',
  propertyTitle: 'Lacqua DiRoma IV',
  propertyLocation: 'Caldas Novas',
  propertyImage: 'https://example.test/property.jpg',
  checkIn: '2026-10-13',
  checkOut: '2026-10-15',
  nights: 2,
  guests: { adults: 1, children: 0, infants: 0, pets: 0 },
  pricePerNight: 350,
  cleaningFee: 150,
  serviceFee: 0,
  discount: 0,
  totalAmount: 850,
  paymentMethod: 'pix',
  status: 'confirmed',
  createdAt: '2026-10-01T12:00:00Z',
  hostName: 'Central de Reservas Caldas Novas',
  guestName: 'Hóspede',
  guestEmail: 'guest@example.test',
  guestPhone: '',
  staysReservationId: 'reservation-1',
  staysSyncStatus: 'synced',
};

const setReservationsResponse = (payload: unknown) => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
};

test('returns validated reservation records from the authenticated API', async () => {
  const originalFetch = globalThis.fetch;
  setReservationsResponse({ success: true, data: [reservation] });

  try {
    assert.deepEqual(await crcnBackendApi.getMyReservations('test-token'), [reservation]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects malformed reservation data instead of casting it to the UI type', async () => {
  const originalFetch = globalThis.fetch;
  setReservationsResponse({
    success: true,
    data: [{ ...reservation, checkIn: '2026-02-30' }],
  });

  try {
    await assert.rejects(
      crcnBackendApi.getMyReservations('test-token'),
      /dados inválidos para reservas/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
