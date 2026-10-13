import assert from 'node:assert/strict';
import test from 'node:test';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import {
  countActivePropertyFilters,
  filterPropertiesBySearchFilters,
} from '../src/utils/propertySearchFilters.ts';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';

const sourceProperty = STAYS_NET_APARTMENTS[0]!;
const property = { ...sourceProperty, staysPropertyId: 'resort-4' };

test('combines catalog filters and rejects properties that miss any selected criterion', () => {
  const filters = {
    ...createDefaultSearchFilters(),
    destination: 'caldas nov',
    destinationPropertyId: 'resort-4',
    guests: { adults: 4, children: 2, infants: 0, pets: 0 },
    minPrice: 350,
    maxPrice: 350,
    propertyTypes: ['entire_place'],
    amenities: ['piscina', 'Wi-Fi'],
    minBedrooms: 2,
    minBaths: 2,
    superhostOnly: true,
    instantBookOnly: true,
  };

  assert.deepEqual(filterPropertiesBySearchFilters([property], filters), [property]);
  assert.deepEqual(
    filterPropertiesBySearchFilters([property], { ...filters, destinationPropertyId: 'other' }),
    [],
  );
  assert.deepEqual(
    filterPropertiesBySearchFilters([property], { ...filters, destination: 'Manaus' }),
    [],
  );
  assert.deepEqual(
    filterPropertiesBySearchFilters([property], {
      ...filters,
      guests: { ...filters.guests, adults: 7 },
    }),
    [],
  );
  assert.deepEqual(filterPropertiesBySearchFilters([property], { ...filters, minPrice: 351 }), []);
  assert.deepEqual(
    filterPropertiesBySearchFilters([property], { ...filters, propertyTypes: ['villa'] }),
    [],
  );
  assert.deepEqual(filterPropertiesBySearchFilters([property], { ...filters, minBedrooms: 3 }), []);
  assert.deepEqual(filterPropertiesBySearchFilters([property], { ...filters, minBaths: 3 }), []);
  assert.deepEqual(
    filterPropertiesBySearchFilters([{ ...property, isSuperhost: false }], filters),
    [],
  );
  assert.deepEqual(
    filterPropertiesBySearchFilters([{ ...property, instantBook: false }], filters),
    [],
  );
  assert.deepEqual(
    filterPropertiesBySearchFilters([property], { ...filters, amenities: ['piscina', 'sauna'] }),
    [],
  );
});

test('counts active filters using the existing filter-pill rules', () => {
  assert.equal(countActivePropertyFilters(createDefaultSearchFilters()), 0);
  assert.equal(
    countActivePropertyFilters({
      ...createDefaultSearchFilters(),
      minPrice: 100,
      propertyTypes: ['entire_place'],
      amenities: ['Piscina', 'Wi-Fi'],
      minBedrooms: 2,
      minBaths: 1,
      superhostOnly: true,
      instantBookOnly: true,
    }),
    8,
  );
});
