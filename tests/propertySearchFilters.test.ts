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

test('matches translated Stays amenity names despite accent and punctuation differences', () => {
  const liveProperty = {
    ...property,
    amenities: ['Ar condicionado', 'Internet Wi-Fi', 'Piscina aquecida'],
  };
  const filters = {
    ...createDefaultSearchFilters(),
    amenities: ['Ar-condicionado', 'Wi-Fi', 'Piscina'],
  };

  assert.deepEqual(filterPropertiesBySearchFilters([liveProperty], filters), [liveProperty]);
});

test('filters by apartment and condominium amenities when the general list is empty', () => {
  const liveProperty = {
    ...property,
    amenities: ['   '],
    listingAmenities: ['Internet Wi-Fi'],
    propertyAmenities: ['Sauna'],
  };
  const filters = {
    ...createDefaultSearchFilters(),
    amenities: ['Wi-Fi', 'Sauna'],
  };

  assert.deepEqual(filterPropertiesBySearchFilters([liveProperty], filters), [liveProperty]);
  assert.deepEqual(
    filterPropertiesBySearchFilters([{ ...liveProperty, propertyAmenities: ['Piscina'] }], filters),
    [],
  );
});

test('filters by apartment amenities even when the general catalog list is populated', () => {
  const liveProperty = {
    ...property,
    amenities: ['Piscina aquecida'],
    listingAmenities: ['Wi-Fi fibra óptica'],
  };
  const filters = {
    ...createDefaultSearchFilters(),
    amenities: ['Wi-Fi'],
  };

  assert.deepEqual(filterPropertiesBySearchFilters([liveProperty], filters), [liveProperty]);
});

test('uses confirmed nightly quotes for price filters on dated searches', () => {
  const filters = {
    ...createDefaultSearchFilters(),
    checkIn: '2027-05-01',
    checkOut: '2027-05-04',
    minPrice: 400,
    maxPrice: 500,
  };
  const quotedProperty = {
    ...property,
    pricePerNight: 250,
    calculatedPrice: {
      nights: 3,
      dailyRate: 450,
      basePrice: 1350,
      cleaningFee: 0,
      serviceFee: 0,
      totalAmount: 1350,
      currency: 'BRL',
    },
  };
  const unquotedProperty = {
    ...property,
    id: 'without-date-quote',
    pricePerNight: 450,
    calculatedPrice: undefined,
  };

  assert.deepEqual(filterPropertiesBySearchFilters([quotedProperty], filters), [quotedProperty]);
  assert.deepEqual(filterPropertiesBySearchFilters([unquotedProperty], filters), []);
  assert.deepEqual(
    filterPropertiesBySearchFilters([unquotedProperty], {
      ...filters,
      minPrice: 0,
      maxPrice: 5000,
    }),
    [unquotedProperty],
  );
});

test('keeps an expired result under its last known price refinement while its display requires renewal', () => {
  const expired = {
    ...STAYS_NET_APARTMENTS[0]!,
    calculatedPrice: {
      nights: 2,
      dailyRate: 250,
      basePrice: 500,
      cleaningFee: 0,
      serviceFee: 0,
      totalAmount: 500,
      currency: 'BRL',
      expiresAt: 1,
    },
  };
  const filters = {
    ...createDefaultSearchFilters(),
    checkIn: '2027-01-10',
    checkOut: '2027-01-12',
    minPrice: 200,
    maxPrice: 300,
  };
  assert.deepEqual(filterPropertiesBySearchFilters([expired], filters), [expired]);
});
