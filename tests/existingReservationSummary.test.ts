import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSummary } from '../src/components/booking/existingReservationSummary';

const base = {
  code: 'ZY92K',
  listingId: 'LISTING',
  property: 'Imóvel',
  image: null,
  checkIn: '2026-11-13',
  checkOut: '2026-11-16',
  guests: 2,
  adults: 2,
  children: 0,
  infants: 0,
  totalCents: 39500,
  candidateBalanceCents: 19750,
  outstandingBalanceCents: 39500,
  balanceStatus: 'pending_candidate',
  paymentEnabled: false,
  paymentMethods: [],
  cardInstallments: [],
  paymentPlans: {
    full: { methods: [], amountCents: null },
    deposit: { methods: ['pix'], amountCents: 19750 },
  },
};

test('reservation plans require proven consistent server amounts and eligible methods', () => {
  assert.equal(isSummary(base, 'ZY92K'), true);
  for (const change of [
    { candidateBalanceCents: null },
    { outstandingBalanceCents: null },
    { outstandingBalanceCents: 10000 },
    { totalCents: 40000 },
    { paymentPlans: { full: { methods: [], amountCents: null }, deposit: { methods: ['pix'] } } },
    {
      paymentPlans: {
        full: { methods: [], amountCents: null },
        deposit: { methods: ['card'], amountCents: 19750 },
      },
    },
    {
      paymentPlans: {
        full: { methods: [], amountCents: null },
        deposit: { methods: ['pix'], amountCents: 19500 },
      },
    },
    {
      paymentEnabled: true,
      paymentMethods: ['pix'],
      paymentPlans: {
        full: { methods: ['pix'], amountCents: 39500 },
        deposit: { methods: ['pix'], amountCents: 19750 },
      },
    },
  ]) {
    assert.equal(isSummary({ ...base, ...change }, 'ZY92K'), false, JSON.stringify(change));
  }
});

test('legacy summaries require a coherent payable candidate without assuming an unreported balance', () => {
  const legacy: Record<string, unknown> = { ...base };
  Reflect.deleteProperty(legacy, 'paymentPlans');
  Reflect.deleteProperty(legacy, 'outstandingBalanceCents');
  const payable = { ...legacy, paymentEnabled: true, paymentMethods: ['pix'] };
  assert.equal(isSummary(payable, 'ZY92K'), true);
  assert.equal(isSummary({ ...payable, outstandingBalanceCents: null }, 'ZY92K'), true);
  assert.equal(isSummary({ ...payable, outstandingBalanceCents: 39500 }, 'ZY92K'), true);
  assert.equal(isSummary({ ...legacy, candidateBalanceCents: null }, 'ZY92K'), true);

  for (const change of [
    { candidateBalanceCents: null },
    { candidateBalanceCents: 0 },
    { balanceStatus: 'review_required' },
    { outstandingBalanceCents: 10000 },
    { paymentMethods: ['pix', 'pix'] },
    { paymentMethods: ['card'], cardInstallments: [1, 1] },
    { paymentMethods: ['card'], cardInstallments: [] },
  ]) {
    assert.equal(isSummary({ ...payable, ...change }, 'ZY92K'), false, JSON.stringify(change));
  }
});
