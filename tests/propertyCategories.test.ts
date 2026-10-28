import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property } from '../src/types';
import { matchesPropertyCategory } from '../src/utils/propertyCategories';

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'listing-1',
  title: 'Flat termal',
  subtitle: 'Acomodação em Caldas Novas',
  description: '',
  category: 'stays-category-raw-id',
  propertyType: 'entire_place',
  location: { city: 'Caldas Novas', state: 'GO', country: 'Brasil', neighborhood: '', address: '', lat: 0, lng: 0 },
  pricePerNight: 0,
  cleaningFee: 0,
  serviceFeeRate: 0,
  rating: 0,
  reviewCount: 0,
  isSuperhost: false,
  isGuestFavorite: false,
  instantBook: false,
  images: [],
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  maxGuests: 2,
  amenities: [],
  highlights: [],
  sleepingArrangements: [],
  rules: [],
  host: { name: '', avatar: '', joinedYear: 0, isSuperhost: false, responseTime: '', responseRate: '', bio: '' },
  reviews: [],
  ...overrides,
});

test('all category always matches and category inference uses the actual listing text', () => {
  const listing = property({ complexName: 'Lacqua diRoma', maxGuests: 6 });
  assert.equal(matchesPropertyCategory(listing, 'all'), true);
  assert.equal(matchesPropertyCategory(listing, 'family_friendly'), true);
  assert.equal(matchesPropertyCategory(listing, 'near_center'), false);
});

test('condominium category includes only listings associated with a condominium', () => {
  assert.equal(
    matchesPropertyCategory(property({ complexName: 'Lacqua diRoma' }), 'condominiums'),
    true,
  );
  assert.equal(matchesPropertyCategory(property(), 'condominiums'), false);
});

test('detects pool access, beverage rules and included waterpark only when stated', () => {
  const listing = property({
    title: 'Apto aconchegante',
    complexName: 'Resort das Águas',
    description: 'Piscinas termais 24 horas. Acesso ao parque aquático com ingressos inclusos.',
    rules: ['É permitido descer com seu cooler e bebidas para a piscina.'],
  });
  assert.equal(matchesPropertyCategory(listing, 'pool_access'), true);
  assert.equal(matchesPropertyCategory(listing, 'pools_24h'), true);
  assert.equal(matchesPropertyCategory(listing, 'beverages_allowed'), true);
  assert.equal(matchesPropertyCategory(listing, 'waterpark_included'), true);
  assert.equal(matchesPropertyCategory(listing, 'hot_tub'), false);
  assert.equal(matchesPropertyCategory(property({ description: 'Piscina termal no condomínio.' }), 'pools_24h'), false);
  assert.equal(matchesPropertyCategory(property({ description: 'Permite animais de pequeno porte.' }), 'pet_friendly'), true);
});

test('does not claim beverages are allowed when listing rules prohibit them', () => {
  const listing = property({ rules: ['Não é permitido descer com bebidas ou cooler.'] });
  assert.equal(matchesPropertyCategory(listing, 'beverages_allowed'), false);
  assert.equal(matchesPropertyCategory(property({ description: 'Não é permitido descer com bebidas para a área de lazer.' }), 'beverages_allowed'), false);
  assert.equal(matchesPropertyCategory(property({ description: 'A acomodação não tem cozinha e não é permitido cozinhar.' }), 'beverages_allowed'), false);
});

test('finds central locations from location fields, not unrelated description text', () => {
  assert.equal(matchesPropertyCategory(property({ location: { city: 'Caldas Novas', state: 'GO', country: 'Brasil', neighborhood: 'Centro', address: '', lat: 0, lng: 0 } }), 'near_center'), true);
  assert.equal(matchesPropertyCategory(property({ description: 'Localização: 2 km do centro.' }), 'near_center'), true);
  assert.equal(matchesPropertyCategory(property({ description: 'Localização: 5 km do centro.' }), 'near_center'), false);
  assert.equal(matchesPropertyCategory(property({ description: 'Próximo ao centro da cidade.' }), 'near_center'), false);
});
