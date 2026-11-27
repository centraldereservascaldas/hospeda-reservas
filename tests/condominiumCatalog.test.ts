import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property } from '../src/types';
import { buildCondominiumCatalog, formatCondominiumName } from '../src/utils/condominiumCatalog';

const listing = (overrides: Partial<Property> = {}) =>
  ({
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
    listing({
      id: 'unit-2',
      title: 'Condomínio - Apto 202',
      images: ['https://example.com/room.jpg'],
    }),
  ]);

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'Condomínio');
  assert.equal(catalog[0].accommodationCount, 2);
  assert.deepEqual(catalog[0].images, ['https://example.com/pool.jpg']);
  assert.deepEqual(catalog[0].images, ['https://example.com/pool.jpg']);
});

test('never substitutes apartment photos when a condominium has no photos and keeps the fullest description', () => {
  const catalog = buildCondominiumCatalog([
    listing({
      id: 'unit-1',
      complexDescription: 'Breve.',
      images: ['https://example.com/room-a.jpg'],
    }),
    listing({
      id: 'unit-2',
      complexDescription: 'Piscinas termais. Restaurante e academia disponíveis.',
      images: ['https://example.com/room-b.jpg'],
    }),
  ]);

  assert.deepEqual(catalog[0].images, []);
  assert.equal(catalog[0].description, 'Piscinas termais. Restaurante e academia disponíveis.');
});

test('uses Stays property IDs to separate homonyms and keep renamed units together', () => {
  const catalog = buildCondominiumCatalog([
    listing({ id: 'a', staysPropertyId: 'property-1' }),
    listing({ id: 'b', staysPropertyId: 'property-2' }),
    listing({ id: 'c', staysPropertyId: 'property-1', complexName: 'Nome atualizado' }),
  ]);
  assert.equal(catalog.length, 2);
  assert.equal(catalog.find(({ id }) => id === 'property-1')?.accommodationCount, 2);
  assert.equal(catalog.find(({ id }) => id === 'property-1')?.pageUrl, '/condominios/property-1');
  assert.equal(catalog.find(({ id }) => id === 'property-2')?.pageUrl, '/condominios/property-2');
});

test('uses the canonical condominium path and rejects external URLs', () => {
  const catalog = buildCondominiumCatalog([
    listing({ staysPropertyId: 'property-1', complexPageUrl: '/condominios/jardim-das-aguas' }),
    listing({ id: 'b', staysPropertyId: 'property-2', complexPageUrl: 'https://example.com/' }),
  ]);
  assert.equal(
    catalog.find(({ id }) => id === 'property-1')?.pageUrl,
    '/condominios/jardim-das-aguas',
  );
  assert.equal(catalog.find(({ id }) => id === 'property-2')?.pageUrl, '/condominios/property-2');
});

test('formats uppercase partner condominium names for display and appends partner entries', () => {
  assert.equal(formatCondominiumName('AGUAS DA FONTE'), 'Aguas da Fonte');
  assert.equal(formatCondominiumName('LACQUA DIROMA'), 'Lacqua diRoma');
  assert.equal(formatCondominiumName('ATRIUM THERMAS II'), 'Atrium Thermas II');
  assert.equal(formatCondominiumName('Aguas da Fonte'), 'Aguas da Fonte');

  const catalog = buildCondominiumCatalog(
    [],
    [
      { id: 'imobsys-condo-1', name: 'AGUAS DA FONTE' },
      { id: 'stays-1', name: 'CONDOMÍNIO NÃO PARCEIRO' },
    ],
  );
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'Aguas da Fonte');
  assert.equal(catalog[0].source, 'imobsys');
  assert.equal(catalog[0].accommodationCount, 0);
  assert.match(catalog[0].pageUrl || '', /query=AGUAS%20DA%20FONTE/);
});
