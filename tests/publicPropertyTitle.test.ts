import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicPropertyTitle } from '../src/utils/publicPropertyTitle';

test('formats the Stays public brand prefix and apartment abbreviation', () => {
  assert.equal(
    getPublicPropertyTitle('CRCN - Ecologic Ville - Apto 801 A'),
    'Ecologic Ville – Apartamento 801 A',
  );
});

test('expands Apt and keeps the listing unit identifier', () => {
  assert.equal(
    getPublicPropertyTitle('Privé das Thermas II - Apt 407 C'),
    'Privé das Thermas II – Apartamento 407 C',
  );
});

test('trims excess spaces without changing the original title value', () => {
  const title = '  CRCN: Casa com Piscina  ';

  assert.equal(getPublicPropertyTitle(title), 'Casa com Piscina');
  assert.equal(title, '  CRCN: Casa com Piscina  ');
});

test('leaves titles without removable prefixes or abbreviations readable', () => {
  assert.equal(getPublicPropertyTitle('Casa da Madeira'), 'Casa da Madeira');
});
