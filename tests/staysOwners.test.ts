import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStaysOwnerDateRanges,
  normalizeStaysOwners,
  resolveStaysFinanceOwner,
} from '../src/utils/staysOwners.ts';

test('covers the requested owner history with Stays date windows no longer than one year', () => {
  const ranges = getStaysOwnerDateRanges(new Date('2026-10-16T23:30:00-03:00'));

  assert.equal(ranges[0]?.from, '2016-01-01');
  assert.equal(ranges[ranges.length - 1]?.to, '2026-10-17');
  assert.equal(ranges.length, 11);
  for (const [index, range] of ranges.entries()) {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    assert.ok((to.getTime() - from.getTime()) / 86_400_000 <= 364);
    if (index > 0) {
      const previousEnd = new Date(`${ranges[index - 1]!.to}T00:00:00.000Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      assert.equal(range.from, previousEnd.toISOString().slice(0, 10));
    }
  }
});

test('normalizes owner records and only returns a minimal safe summary', () => {
  const owners = normalizeStaysOwners([{
    _id: 'owner-1',
    name: 'Maria da Silva',
    listings: [{ id: 'listing-1' }, { id: 'listing-2' }],
    email: 'private@example.com',
    taxId: 'private-tax-id',
    credit: { amount: 5000 },
  }]);

  assert.deepEqual(owners, [{ id: 'owner-1', name: 'Maria da Silva', propertyCount: 2 }]);
  assert.equal(JSON.stringify(owners).includes('private@example.com'), false);
  assert.equal(JSON.stringify(owners).includes('private-tax-id'), false);
  assert.equal(JSON.stringify(owners).includes('5000'), false);
});

test('accepts common response wrappers, deduplicates IDs, and drops invalid records', () => {
  const owners = normalizeStaysOwners({ data: { owners: [
    { id: 'owner-1', fullName: 'João Pereira', listings: [] },
    { id: 'owner-1', name: 'Duplicate' },
    { name: 'No identifier' },
  ] } });

  assert.deepEqual(owners, [{ id: 'owner-1', name: 'Duplicate', propertyCount: 0 }]);
});

test('returns null for an unrecognized Stays response shape instead of an empty directory', () => {
  assert.equal(normalizeStaysOwners({ message: 'unexpected response' }), null);
});

test('resolves finance data only by the exact Stays owner identifier', () => {
  const result = resolveStaysFinanceOwner({ owners: [
    { _id: 'owner-other', name: 'Same name' },
    { _id: 'owner-requested', name: 'Same name', listings: [] },
  ] }, 'owner-requested');

  assert.equal(result.status, 'found');
  if (result.status === 'found') {
    assert.equal(result.owner._id, 'owner-requested');
  }
});

test('distinguishes a valid finance response without the approved owner from a failed response', () => {
  assert.deepEqual(
    resolveStaysFinanceOwner([{ _id: 'different-owner', name: 'Proprietário' }], 'approved-owner'),
    { status: 'not-found' },
  );
  assert.deepEqual(resolveStaysFinanceOwner({ message: 'unavailable' }, 'approved-owner'), {
    status: 'invalid-response',
  });
});
