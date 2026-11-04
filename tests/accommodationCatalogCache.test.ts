import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import {
  readAccommodationCatalogCache,
  writeAccommodationCatalogCache,
  updateAccommodationCatalogCache,
} from '../src/utils/accommodationCatalogCache.ts';

const storage = new JSDOM('', { url: 'http://localhost' }).window.localStorage;
Object.assign(globalThis, { localStorage: storage });
afterEach(() => {
  Object.assign(globalThis, { localStorage: storage });
  storage.clear();
});
const property = STAYS_NET_APARTMENTS[0]!;

test('catalog cache expires after fifteen minutes without reads extending its lifetime', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 3) });
  writeAccommodationCatalogCache([property], 'stays-live');
  context.mock.timers.setTime(Date.now() + 899_999);
  assert.equal(readAccommodationCatalogCache().length, 1);
  context.mock.timers.setTime(Date.now() + 1);
  assert.deepEqual(readAccommodationCatalogCache(), []);
  assert.equal(storage.length, 0);
});

test('rejects legacy, expired, future and unknown-version caches rather than guessing their age', () => {
  for (const metadata of [
    null,
    { version: 1, expiresAt: 1 },
    { version: 2, expiresAt: Date.now() + 10_000 },
    { version: 1, expiresAt: Date.now() + 3_600_000 },
  ]) {
    storage.setItem('hospeda_properties', JSON.stringify([property]));
    storage.setItem('hospeda_properties_source', 'stays-live');
    if (metadata) storage.setItem('hospeda_properties_meta', JSON.stringify(metadata));
    assert.deepEqual(readAccommodationCatalogCache(), []);
    assert.equal(storage.length, 0);
  }
});

test('bounds persisted records and rejects oversized data before parsing it', () => {
  writeAccommodationCatalogCache(
    Array.from({ length: 110 }, (_, id) => ({ ...property, id: `live-${id}` })),
    'stays-live',
  );
  assert.equal(readAccommodationCatalogCache().length, 100);
  storage.setItem('hospeda_properties', 'x'.repeat(1_048_577));
  assert.deepEqual(readAccommodationCatalogCache(), []);
  assert.equal(storage.length, 0);
  writeAccommodationCatalogCache(
    [{ ...property, description: 'x'.repeat(1_048_577) }],
    'stays-live',
  );
  assert.equal(storage.length, 0);
});

test('never persists dated quotes or restores simulated listings as live catalog data', () => {
  const quoted = {
    ...property,
    calculatedPrice: {
      nights: 2,
      dailyRate: 250,
      basePrice: 500,
      cleaningFee: 0,
      serviceFee: 0,
      totalAmount: 500,
      currency: 'BRL',
      expiresAt: Date.now() + 45_000,
    },
  };
  writeAccommodationCatalogCache([quoted], 'stays-live');
  assert.equal(storage.getItem('hospeda_properties')?.includes('calculatedPrice'), false);
  // Old or modified payloads with quotes also cannot restore them.
  storage.setItem('hospeda_properties', JSON.stringify([quoted]));
  assert.equal(readAccommodationCatalogCache()[0]?.calculatedPrice, undefined);
  writeAccommodationCatalogCache([property], 'stays-simulated');
  assert.deepEqual(readAccommodationCatalogCache(), []);
});

test('refreshing one gallery keeps the original catalog expiry and preserves unrelated IDs', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 3) });
  const first = { ...property, id: 'first', staysListingId: undefined };
  const second = { ...property, id: 'second', staysListingId: undefined };
  writeAccommodationCatalogCache([first, second], 'stays-live');
  const deadline = JSON.parse(storage.getItem('hospeda_properties_meta')!).expiresAt;
  context.mock.timers.setTime(Date.now() + 60_000);
  updateAccommodationCatalogCache({ ...second, title: 'Galeria atualizada' });
  assert.equal(JSON.parse(storage.getItem('hospeda_properties_meta')!).expiresAt, deadline);
  assert.deepEqual(
    readAccommodationCatalogCache().map(({ id, title }) => [id, title]),
    [
      ['first', first.title],
      ['second', 'Galeria atualizada'],
    ],
  );
});

test('unavailable or full browser storage does not fail live catalog consumers', () => {
  Object.assign(globalThis, {
    localStorage: {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('storage disabled');
      },
    },
  });
  assert.deepEqual(readAccommodationCatalogCache(), []);
  assert.doesNotThrow(() => writeAccommodationCatalogCache([property], 'stays-live'));
  assert.doesNotThrow(() => updateAccommodationCatalogCache(property));
});
