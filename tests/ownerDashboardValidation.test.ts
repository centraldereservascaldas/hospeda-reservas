import assert from 'node:assert/strict';
import test from 'node:test';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { isOwnerDashboardData } from '../src/utils/ownerDashboardValidation.ts';

const dashboard = {
  success: true,
  period: { from: '2026-10-01', to: '2026-10-31' },
  ownerName: 'Proprietário',
  totals: { debit: 250, credit: 1200 },
  properties: [
    {
      staysListingId: 'JQ08G',
      title: 'Apartamento Caldas',
      image: '',
      debit: 250,
      credit: 1200,
    },
  ],
  reservations: [
    {
      id: 'reservation-1',
      code: 'ABC123',
      listingId: 'JQ08G',
      propertyTitle: 'Apartamento Caldas',
      propertyImage: '',
      guestName: 'Hóspede',
      checkIn: '2026-10-10',
      checkOut: '2026-10-12',
      status: 'confirmed',
      paymentStatus: 'paid',
      total: 800,
      currency: 'BRL',
      nights: 2,
    },
  ],
  entries: [
    {
      id: 'account-1',
      date: '2026-10-27',
      listingId: 'JQ08G',
      propertyTitle: 'Apartamento Caldas',
      reservationId: 'reservation-1',
      reservationCode: 'ABC123',
      description: '27/10/2026 - 29/10/2026',
      publicNote: null,
      type: 'credit',
      status: 'received',
      amount: 120,
    },
  ],
};

test('accepts the Laravel owner dashboard response shape', () => {
  assert.equal(isOwnerDashboardData(dashboard), true);
});

test('clears unsafe property and reservation images from the owner dashboard response', async () => {
  const originalFetch = globalThis.fetch;
  const payload = {
    ...dashboard,
    properties: [{ ...dashboard.properties[0], image: 'data:image/svg+xml,<svg onload=alert(1)>' }],
    reservations: [{ ...dashboard.reservations[0], propertyImage: '/relative/image.jpg' }],
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const result = await crcnBackendApi.getOwnerDashboard('test-token', '2026-10-01', '2026-10-31');
    assert.equal(result.properties[0]?.image, '');
    assert.equal(result.reservations[0]?.propertyImage, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects incomplete, invalid-date, and non-finite owner dashboard data', () => {
  assert.equal(isOwnerDashboardData({ ...dashboard, totals: { debit: 0 } }), false);
  assert.equal(
    isOwnerDashboardData({ ...dashboard, entries: [{ ...dashboard.entries[0], type: 'unknown' }] }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({ ...dashboard, period: { from: '2026-02-30', to: '2026-03-01' } }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({ ...dashboard, totals: { debit: Number.NaN, credit: 0 } }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({
      ...dashboard,
      reservations: [{ ...dashboard.reservations[0], status: 'pending' }],
    }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({
      ...dashboard,
      reservations: [{ ...dashboard.reservations[0], paymentStatus: 'in_progress' }],
    }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({
      ...dashboard,
      reservations: [{ ...dashboard.reservations[0], checkOut: '2026-10-10' }],
    }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({
      ...dashboard,
      reservations: [{ ...dashboard.reservations[0], nights: 0 }],
    }),
    false,
  );
  assert.equal(
    isOwnerDashboardData({
      ...dashboard,
      reservations: [{ ...dashboard.reservations[0], nights: 3 }],
    }),
    false,
  );
});

test('loads validated Stays accounting reservation details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /owner\/accounting\/entries\/account-1\/details/);
    return new Response(
      JSON.stringify({
        success: true,
        details: {
          reservationCode: 'QI03J',
          guestName: 'Hóspede',
          checkIn: '2026-10-27',
          checkOut: '2026-10-29',
          nights: 2,
          fees: [{ label: 'Taxa de limpeza', amount: 80 }],
          payout: 120,
          ledgerEntry: {
            date: '2026-10-27',
            type: 'credit',
            status: 'paid',
            description: 'Repasse da reserva',
            amount: 120,
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const result = await crcnBackendApi.getOwnerAccountingDetails(
      'test-token',
      'account-1',
      'JQ08G',
      '2026-10-01',
      '2026-10-31',
    );
    assert.equal(result.guestName, 'Hóspede');
    assert.equal(result.reservationCode, 'QI03J');
    assert.equal(result.fees[0]?.amount, 80);
    assert.equal(result.ledgerEntry.amount, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
