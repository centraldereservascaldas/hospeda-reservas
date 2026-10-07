import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property } from '../src/types';
import { buildCondominiumCatalog } from '../src/utils/condominiumCatalog';

const listing = (overrides: Partial<Property> = {}) => ({
  id: 'unit-1',
  title: 'Condomínio - Apto 101',
  complexName: 'CRCN - Condomínio',
  complexDescription: 'Piscinas e lazer para toda a família.',
  complexImages: [],
  images: ['https://example.com/apartment.jpg'],
  ...overrides,
}) as Property;

test('groups accommodations by condominium and uses only condominium photos when available', () => {
  const catalog = buildCondominiumCatalog([
    listing({ id: 'unit-1', complexImages: ['https://example.com/pool.jpg'] }),
    listing({ id: 'unit-2', title: 'Condomínio - Apto 202', images: ['https://example.com/room.jpg'] }),
  ]);

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'Condomínio');
  assert.equal(catalog[0].accommodationCount, 2);
  assert.deepEqual(catalog[0].images, ['https://example.com/pool.jpg']);
  assert.deepEqual(catalog[0].images, ['https://example.com/pool.jpg']);
});

test('never substitutes apartment photos when a condominium has no photos and keeps the fullest description', () => {
  const catalog = buildCondominiumCatalog([
    listing({ id: 'unit-1', complexDescription: 'Breve.', images: ['https://example.com/room-a.jpg'] }),
    listing({ id: 'unit-2', complexDescription: 'Piscinas termais. Restaurante e academia disponíveis.', images: ['https://example.com/room-b.jpg'] }),
  ]);

  assert.deepEqual(catalog[0].images, []);
  assert.equal(catalog[0].description, 'Piscinas termais. Restaurante e academia disponíveis.');
});
