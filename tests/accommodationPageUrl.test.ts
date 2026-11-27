import assert from 'node:assert/strict';
import test from 'node:test';
import type { Property } from '../src/types';
import { accommodationPagePath } from '../src/utils/accommodationPageUrl';
import { getAccommodationIdFromPath } from '../src/utils/searchUrlState';

test('uses a partner-facing address while retaining the internal listing identity', () => {
  const property = { id: 'imobsys-crcn-1-961', dataSource: 'imobsys-live' } as Property;
  const path = accommodationPagePath(property);
  assert.equal(path, '/apartamento/parceiro-crcn-1-961');
  assert.equal(getAccommodationIdFromPath(path), property.id);
  assert.equal(getAccommodationIdFromPath('/apartamento/imobsys-crcn-1-961'), property.id);
});

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
