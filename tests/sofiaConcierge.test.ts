import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property } from '../src/types';
import { buildSofiaFallback } from '../src/utils/sofiaConcierge';

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'riviera-308',
  title: 'Prive Riviera Park Hotel - Suíte 308',
  complexName: 'Prive Riviera Park Hotel',
  subtitle: 'Suíte em Caldas Novas',
  description: 'O condomínio possui 14 piscinas termais.',
  category: 'resorts_flats',
  propertyType: 'entire_place',
  location: {
    city: 'Caldas Novas',
    state: 'GO',
    country: 'Brasil',
    neighborhood: '',
    address: '',
    lat: 0,
    lng: 0,
  },
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
  beds: 2,
  bathrooms: 1,
  maxGuests: 4,
  amenities: [],
  propertyAmenities: [],
  listingAmenities: [],
  highlights: [],
  sleepingArrangements: [],
  rules: [],
  host: {
    name: '',
    avatar: '',
    joinedYear: 0,
    isSuperhost: false,
    responseTime: '',
    responseRate: '',
    bio: '',
  },
  reviews: [],
  ...overrides,
});

test('new stay search takes precedence over an earlier pool-count clarification', () => {
  const result = buildSofiaFallback(
    'queria um apartamento para 8 pessoas',
    [
      { role: 'user', content: 'quantas piscinas tem no condomínio boulevard?' },
      {
        role: 'assistant',
        content: 'De qual condomínio você quer saber a quantidade de piscinas?',
      },
    ],
    [
      property({ id: 'for-8', title: 'Apartamento Família', maxGuests: 8 }),
      property({ id: 'for-4', title: 'Flat Casal', maxGuests: 4 }),
    ],
  );

  assert.match(result.reply, /para até 8 hóspedes/);
  assert.deepEqual(
    result.matchedProperties.map((item) => item.id),
    ['for-8'],
  );
});

test('pool count comes only from the named condo facts and does not match the word pools in another title', () => {
  const result = buildSofiaFallback(
    'Quantas piscinas tem no condomínio Boulevard?',
    [],
    [property({ id: 'riviera', title: 'Riviera (14 Piscinas Termais)' })],
  );

  assert.match(result.reply, /não encontrei a quantidade de piscinas de Boulevard/i);
  assert.equal(result.matchedProperties.length, 0);
});

test('does not confuse similar condo names when the requested name is not in the catalog', () => {
  const result = buildSofiaFallback(
    'Quantas piscinas tem no condomínio Thermas Boulevard?',
    [],
    [
      property({
        title: 'Thermas dos Pássaros - Apto 12',
        complexName: 'Thermas dos Pássaros',
        description: 'O local tem 8 piscinas.',
      }),
    ],
  );
  assert.match(result.reply, /quantidade de piscinas de Thermas Boulevard/i);
});

test('can answer a pool-count question from the matching condo facts', () => {
  const result = buildSofiaFallback('Quantas piscinas tem no Prive Riviera?', [], [property()]);
  assert.match(result.reply, /informa 14 piscinas/);
});

test('answers pool counts from the separate Stays condo description field', () => {
  const result = buildSofiaFallback(
    'Quantas piscinas tem no condomínio Boulevard?',
    [],
    [
      property({
        title: 'Boulevard Suíte 301',
        complexName: 'CRCN - Boulevard Suíte',
        description: 'Apartamento com quarto e sala.',
        complexDescription:
          'CONDOMÍNIO COM 07 PISCINAS:\n✓ 05 piscinas termais adultas\n✓ 01 piscina com hidromassagem\n✓ 01 piscina com cascata',
      }),
    ],
  );
  assert.match(result.reply, /informa 07 piscinas/);
});

test('answers direct pool-hours questions with the specific sentence from the condo description', () => {
  const result = buildSofiaFallback(
    'O Boulevard tem piscina 24 horas?',
    [],
    [
      property({
        title: 'Boulevard Suíte 301',
        complexName: 'CRCN - Boulevard Suíte',
        description: 'Apartamento mobiliado.',
        complexDescription: 'Horário das Piscinas:\nSomente 01 piscina funciona 24horas!',
      }),
    ],
  );
  assert.match(result.reply, /Somente 01 piscina funciona 24horas/);
});

test('keeps the condo context when a guest asks a short pool-hours follow-up', () => {
  const result = buildSofiaFallback(
    'E quantas funcionam 24h?',
    [
      { role: 'user', content: 'Quantas piscinas tem no condomínio Boulevard?' },
      { role: 'assistant', content: 'A ficha do Boulevard informa 7 piscinas.' },
    ],
    [
      property({
        complexName: 'CRCN - Boulevard Suíte',
        complexDescription: 'Horário das Piscinas:\nSomente 01 piscina funciona 24horas!',
      }),
    ],
  );
  assert.match(result.reply, /Somente 01 piscina funciona 24horas/);
});

test('does not offer arbitrary property cards for an unrecognized general question', () => {
  const result = buildSofiaFallback('Oi, você pode me ajudar?', [], [property()]);
  assert.equal(result.matchedProperties.length, 0);
  assert.equal(result.totalFound, 0);
});

test('search respects multiple catalog criteria and guest capacity together', () => {
  const wanted = property({
    id: 'wanted',
    maxGuests: 8,
    description: 'Piscina em funcionamento 24 horas. É permitido descer com bebidas.',
  });
  const wrongCapacity = property({ id: 'small', maxGuests: 4, description: wanted.description });
  const wrongAmenity = property({
    id: 'no-24h',
    maxGuests: 10,
    description: 'Piscina e bebidas permitidas.',
  });
  const result = buildSofiaFallback(
    'Quero apartamento para 8 pessoas com piscina 24h e bebidas permitidas',
    [],
    [wrongCapacity, wrongAmenity, wanted],
  );

  assert.equal(result.totalFound, 1);
  assert.deepEqual(
    result.matchedProperties.map((item) => item.id),
    ['wanted'],
  );
  assert.match(result.reply, /piscina 24 horas, bebidas permitidas/);
});

test('does not recommend a property when beverages are mentioned as forbidden', () => {
  const forbidden = property({
    id: 'forbidden',
    maxGuests: 8,
    rules: ['Não é permitido descer com bebidas ou cooler.'],
  });
  const result = buildSofiaFallback(
    'Busco hospedagem para 8 pessoas onde seja permitido descer com bebida',
    [],
    [forbidden],
  );
  assert.equal(result.totalFound, 0);
  assert.equal(result.matchedProperties.length, 0);
});

test('applies explicit condominium rules when filtering for drinks', () => {
  const condoRules = property({
    id: 'boulevard',
    maxGuests: 8,
    complexName: 'CRCN - Boulevard Suíte',
    complexDescription:
      'Regras do condomínio:\nNão permite descer com bebidas para mesas (em latas).',
  });
  const result = buildSofiaFallback(
    'Quero apartamento no condomínio Boulevard que permita descer com bebidas',
    [],
    [condoRules],
  );
  assert.equal(result.totalFound, 0);
  assert.equal(result.matchedProperties.length, 0);
});

test('answers a natural-language condo rules question with the explicit rule from its description', () => {
  const result = buildSofiaFallback(
    'Quais são as regras para descer com bebidas no condomínio Boulevard?',
    [],
    [
      property({
        complexName: 'CRCN - Boulevard Suíte',
        complexDescription:
          'Regras do condomínio:\nNão permite descer com bebidas para mesas (em latas).',
      }),
    ],
  );
  assert.match(result.reply, /Não permite descer com bebidas/);
});

test('treats an apartment amenity question as a question, not a recommendation request', () => {
  const result = buildSofiaFallback(
    'O apartamento Boulevard permite descer bebidas?',
    [],
    [
      property({
        complexName: 'CRCN - Boulevard Suíte',
        complexDescription:
          'Regras do condomínio:\nNão permite descer com bebidas para mesas (em latas).',
      }),
    ],
  );
  assert.match(result.reply, /Não permite descer com bebidas/);
  assert.equal(result.matchedProperties.length, 0);
});

test('summarizes condo amenities when asked what the condo offers', () => {
  const result = buildSofiaFallback(
    'O que tem no condomínio Boulevard?',
    [],
    [
      property({
        complexName: 'CRCN - Boulevard Suíte',
        complexDescription:
          'CONDOMÍNIO COM 07 PISCINAS:\n05 piscinas termais adultas\nSauna\nAcademia\nLanchonete',
      }),
    ],
  );
  assert.match(result.reply, /07 PISCINAS/);
  assert.match(result.reply, /Sauna/);
});

test('answers a specific amenity question from the condo text without requiring a hardcoded category', () => {
  const result = buildSofiaFallback(
    'O Boulevard tem academia?',
    [],
    [
      property({
        complexName: 'CRCN - Boulevard Suíte',
        complexDescription: 'Academia disponível aos hóspedes. Sauna e sala de jogos.',
      }),
    ],
  );
  assert.match(result.reply, /Academia disponível aos hóspedes/);
});

test('answers structured room counts directly rather than turning the question into a search', () => {
  const result = buildSofiaFallback(
    'O apartamento Prive Riviera tem quantos quartos?',
    [],
    [property({ bedrooms: 2 })],
  );
  assert.match(result.reply, /informa 2 quartos/);
  assert.equal(result.matchedProperties.length, 0);
});

test('carries an apartment-capacity question into a short follow-up naming another condo', () => {
  const units = [
    property({
      id: 'bosque-906',
      title: 'Recanto do Bosque - Apto 906',
      complexName: 'CRCN - Recanto do Bosque',
      maxGuests: 4,
    }),
    property({
      id: 'bosque-1208',
      title: 'Recanto do Bosque - Apto 1208',
      complexName: 'CRCN - Recanto do Bosque',
      maxGuests: 5,
    }),
  ];
  const result = buildSofiaFallback(
    'E no Recanto do Bosque?',
    [
      { role: 'user', content: 'E quantas pessoas comporta no apartamento?' },
      {
        role: 'assistant',
        content: 'A ficha do DiRoma Resorts informa capacidade para até 4 hóspedes.',
      },
    ],
    units,
  );

  assert.match(result.reply, /Recanto do Bosque/);
  assert.match(result.reply, /Apto 906: até 4 hóspedes/);
  assert.match(result.reply, /Apto 1208: até 5 hóspedes/);
  assert.equal(result.matchedProperties.length, 0);
});

test('answers an explicit plural condo-capacity question with each unit capacity instead of search cards', () => {
  const units = [
    property({
      id: 'bosque-906',
      title: 'Recanto do Bosque - Apto 906',
      complexName: 'CRCN - Recanto do Bosque',
      maxGuests: 4,
    }),
    property({
      id: 'bosque-1208',
      title: 'Recanto do Bosque - Apto 1208',
      complexName: 'CRCN - Recanto do Bosque',
      maxGuests: 5,
    }),
    property({
      id: 'bosque-1211',
      title: 'Recanto do Bosque - Apto 1211',
      complexName: 'CRCN - Recanto do Bosque',
      maxGuests: 5,
    }),
  ];
  const result = buildSofiaFallback(
    'Só quero saber a quantidade de pessoas que cabe nos apartamentos do condomínio Recanto do Bosque',
    [],
    units,
  );

  assert.match(result.reply, /encontrei 3 apartamentos:/);
  assert.match(result.reply, /Apto 906: até 4 hóspedes/);
  assert.match(result.reply, /Apto 1208: até 5 hóspedes/);
  assert.match(result.reply, /Apto 1211: até 5 hóspedes/);
  assert.equal(result.matchedProperties.length, 0);
});

test('answers a singular capacity question for the named apartment only', () => {
  const result = buildSofiaFallback(
    'Quantas pessoas cabem no apartamento Boulevard Suíte 529?',
    [],
    [
      property({
        id: 'boulevard-529',
        title: 'Boulevard Suíte Apto 529',
        complexName: 'CRCN Boulevard Suíte',
        maxGuests: 4,
      }),
      property({
        id: 'boulevard-530',
        title: 'Boulevard Suíte Apto 530',
        complexName: 'CRCN Boulevard Suíte',
        maxGuests: 6,
      }),
    ],
  );

  assert.match(result.reply, /Apto 529.*4 hóspedes/);
  assert.doesNotMatch(result.reply, /Apto 530/);
});

test('does not return arbitrary listings when a search has no usable criteria', () => {
  const result = buildSofiaFallback('Quero encontrar um bom apartamento', [], [property()]);
  assert.equal(result.matchedProperties.length, 0);
  assert.equal(result.totalFound, 0);
  assert.match(result.reply, /Quantas pessoas/);
});

test('answers amenity questions as unknown when the catalog has no explicit confirmation', () => {
  const result = buildSofiaFallback(
    'O Prive Riviera permite descer com bebidas?',
    [],
    [property({ rules: [] })],
  );
  assert.match(result.reply, /Não encontrei confirmação/);
});

test('does not claim availability when there are no accommodations matching an explicit condo', () => {
  const result = buildSofiaFallback(
    'Quero apartamento para 8 pessoas no condomínio Boulevard',
    [],
    [property({ maxGuests: 8, complexName: 'Prive Riviera Park Hotel' })],
  );
  assert.equal(result.totalFound, 0);
  assert.match(result.reply, /Não encontrei acomodações/);
});
