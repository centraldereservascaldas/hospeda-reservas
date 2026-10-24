import assert from 'node:assert/strict';
import test from 'node:test';
import { getCatalogAmenities, getPropertyAmenitySummary } from '../src/utils/propertyAmenities.ts';

test('prioritizes listing amenities and merges general and condominium amenities', () => {
  assert.deepEqual(
    getCatalogAmenities(
      ['Piscina termal', 'Estacionamento'],
      ['Ar-condicionado split', 'Wi-Fi fibra óptica'],
      ['Recepção 24h'],
    ),
    [
      'Ar-condicionado split',
      'Wi-Fi fibra óptica',
      'Piscina termal',
      'Estacionamento',
      'Recepção 24h',
    ],
  );
});

test('removes blank and duplicate amenity labels before summarizing the card', () => {
  const catalogAmenities = getCatalogAmenities(
    ['Piscina termal', 'Ar condicionado', '  '],
    ['Ar-condicionado'],
  );

  assert.deepEqual(catalogAmenities, ['Ar-condicionado', 'Piscina termal']);
  assert.deepEqual(getPropertyAmenitySummary(catalogAmenities, 1), {
    visibleAmenities: ['Ar-condicionado'],
    remainingCount: 1,
  });
});
