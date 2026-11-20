import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAccommodationSearch } from '../src/accommodation-search.mjs';

const query={from:'2027-05-17',to:'2027-05-19',guests:'2'};
const result={...query,source:'authenticated-network-search',observedAt:'2026-11-20T12:00:00Z',offers:[{id:'imobsys-crcn-2-663',condominium:'Lacqua',unit:'10189',pixCents:52300}]};
test('preserva origem, total e incerteza na resposta compatível',()=>{
  const mapped=mapAccommodationSearch(result,query);
  assert.equal(mapped.source,'imobsys-live');
  assert.equal(mapped.data[0].calculatedPrice.totalAmount,523);
  assert.equal(mapped.data[0].calculatedPrice.dailyRate,null);
  assert.equal(mapped.meta.availabilityConfirmed,false);
  assert.equal(mapped.meta.bookingEnabled,false);
});
test('recusa período e valor divergentes',()=>{
  assert.throws(()=>mapAccommodationSearch({...result,to:'2027-05-20'},query));
  assert.throws(()=>mapAccommodationSearch({...result,offers:[{...result.offers[0],pixCents:0}]},query));
});
