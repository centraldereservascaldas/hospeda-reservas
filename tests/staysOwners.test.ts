import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStaysOwners } from '../src/utils/staysOwners.ts';

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
