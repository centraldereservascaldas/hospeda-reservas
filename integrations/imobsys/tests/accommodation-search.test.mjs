import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAccommodationSearch, mapPartnerOffers } from '../src/accommodation-search.mjs';

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
test('busca de integração pagina e mantém origem e incerteza',()=>{
 const offer={...result.offers[0],base:'2',reference:'663',capacityText:'Para até 5 pessoas de qualquer idade'};
 const mapped=mapPartnerOffers({...result,offers:[offer]}, {...query,page:'1',pageSize:'1'});
 assert.equal(mapped.offers[0].totalCents,52300);
 assert.equal(mapped.offers[0].capacity,5);
 assert.equal(mapped.offers[0].condominiumId,null);
 assert.equal(mapped.offers[0].availabilityConfirmed,false);
 assert.equal(mapped.absenceMeans,'unknown');
 assert.equal(mapped.pagination.totalObserved,1);
});
test('falha quando filtro de condomínio não tem vínculo confiável',()=>{
 const offer={...result.offers[0],base:'2',reference:'663'};
 assert.throws(()=>mapPartnerOffers({...result,offers:[offer]},{...query,condominiumId:'86'}),{code:'condominium_mapping_unavailable'});
 assert.throws(()=>mapPartnerOffers({...result,offers:[]},{...query,condominiumId:'86'}),{code:'condominium_mapping_unavailable'});
 assert.throws(()=>mapPartnerOffers({...result,offers:[offer,offer]},query),{code:'invalid_offer'});
});
test('associa condomínio e fotos somente à identidade verificada',()=>{
 const offer={...result.offers[0],base:'2',reference:'663'};
 const metadata={[offer.id]:{condominiumId:'imobsys-crcn-condo-86'}};
 const media=[{propertyId:offer.id,apartmentImages:[{kind:'apartment',url:'https://reservascrcn.com.br/fotos/a/imoveis/b/fotos/1.jpg'},{kind:'apartment',url:'https://example.com/fotos/a/imoveis/b/fotos/2.jpg'}]}];
 const response=mapPartnerOffers({...result,offers:[offer]},{...query,condominiumId:'imobsys-crcn-condo-86'},{metadata,media});
 assert.equal(response.offers.length,1);
 assert.equal(response.offers[0].images.length,1);
 assert.equal(response.offers[0].active,null);
 assert.equal(response.offers[0].siteAuthorized,null);
});
test('recusa período e valor divergentes',()=>{
  assert.throws(()=>mapAccommodationSearch({...result,to:'2027-05-20'},query));
  assert.throws(()=>mapAccommodationSearch({...result,offers:[{...result.offers[0],pixCents:0}]},query));
});
