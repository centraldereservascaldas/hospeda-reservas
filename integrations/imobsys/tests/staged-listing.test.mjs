import test from 'node:test';
import assert from 'node:assert/strict';
import { stageListing } from '../src/staged-listing.mjs';
const property = { id: 'imobsys-crcn-1-1149', title: 'Apartamento', base: '1', reference: '1149', availabilityConfirmed: true, images: ['wrong-condominium-image'], lastObservedOffer: { pixCents: 46500, from: '2026-11-27', to: '2026-11-29' } };
test('staging never promotes supplier offers into active inventory or confirmed availability', () => {
  const listing = stageListing(property);
  assert.equal(listing.lifecycle.activeConfirmed, false);
  assert.equal(listing.lifecycle.published, false);
  assert.equal(listing.availability.status, 'unknown');
  assert.deepEqual(listing.capabilities, { booking: false, payment: false });
  assert.deepEqual(listing.images, []);
  assert.equal(listing.price.totalCents, 46500);
});
test('staging rejects malformed money and identity instead of publishing guessed values', () => {
  assert.throws(() => stageListing({ ...property, id: 'stays-1149' }));
  assert.throws(() => stageListing({ ...property, lastObservedOffer: { pixCents: -1 } }));
});
test('only associates unit media with the same supplier record and keeps publication disabled', () => {
  const photos = { propertyId: property.id, apartmentImages: [{ url: 'https://reservascrcn.com.br/fotos/cr/imoveis/090-00109/fotos/a.JPG', kind: 'apartment' }, { url: 'https://reservascrcn.com.br/fotos/cr/condominios/090/fotos/b.JPG', kind: 'condominium' }] };
  const listing = stageListing(property, photos);
  assert.equal(listing.images.length, 1);
  assert.equal(listing.lifecycle.published, false);
  assert.equal(stageListing(property, { ...photos, propertyId: 'imobsys-crcn-31-3' }).images.length, 0);
});
