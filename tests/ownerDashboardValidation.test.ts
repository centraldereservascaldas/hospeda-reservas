import assert from 'node:assert/strict';
import test from 'node:test';
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
      total: 800,
      currency: 'BRL',
      nights: 2,
    },
  ],
};

test('accepts the Laravel owner dashboard response shape', () => {
  assert.equal(isOwnerDashboardData(dashboard), true);
});

test('rejects incomplete, invalid-date, and non-finite owner dashboard data', () => {
  assert.equal(isOwnerDashboardData({ ...dashboard, totals: { debit: 0 } }), false);
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
});
