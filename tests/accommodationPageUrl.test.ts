import assert from 'node:assert/strict';
import test from 'node:test';
import type { Property } from '../src/types';
import { accommodationPagePath } from '../src/utils/accommodationPageUrl';

test('uses a matching canonical path and rejects paths for other listings', () => {
  const property = {
    id: 'unit',
    staysListingId: 'OB02J',
    publicPagePath: '/apartamento/OB02J/caldas-novas-flat',
  } as Property;
  assert.equal(accommodationPagePath(property), '/apartamento/OB02J/caldas-novas-flat');
  assert.equal(
    accommodationPagePath({ ...property, publicPagePath: '/apartamento/OTHER/slug' }),
    '/apartamento/OB02J',
  );
  assert.equal(
    accommodationPagePath({
      ...property,
      publicPagePath: 'https://example.com/apartamento/OB02J/slug',
    }),
    '/apartamento/OB02J',
  );
});
