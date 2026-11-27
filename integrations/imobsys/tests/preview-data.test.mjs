import test, {mock} from 'node:test';import assert from 'node:assert/strict';import {makePreview} from '../src/preview-data.mjs';
mock.timers.enable({apis:['Date'],now:new Date('2026-11-19T12:00:00Z')});
const offer={id:'imobsys-crcn-1-1149',pixCents:99400,condominium:'Flat',unit:'00109'};
const snapshot={periods:[{from:'2026-11-20',to:'2026-11-22',label:'Fim de semana',offers:[offer],count:1,status:'offers-found',observedAt:'2026-11-18T12:00:00Z',restrictions:[]},{from:'2026-12-31',to:'2027-01-03',label:'Réveillon',offers:[],count:0,status:'not-observed',restrictions:[]}]};
test('preview binds exact dates, total Pix price and apartment media to the supplier identity',()=>{
 const r=makePreview(snapshot,{results:[{propertyId:offer.id,apartmentImages:[{url:'https://reservascrcn.com.br/fotos/cr/imoveis/090-00109/fotos/a.JPG',kind:'apartment'},{url:'https://evil.test/a.JPG',kind:'apartment'}]}]});
 assert.equal(r.offers[0].images.length,1);assert.equal(r.offers[0].pixCents,99400);assert.equal(r.offers[0].nights,2);assert.equal(r.offers[0].from,'2026-11-20');assert.equal(r.bookingEnabled,false);
});
test('preview never falls back to another period when no offer exists',()=>{
 const r=makePreview(snapshot,{results:[]},{from:'2026-12-31',to:'2027-01-03'});assert.equal(r.count,0);
 assert.throws(()=>makePreview(snapshot,{results:[]},{from:'2026-12-10',to:'2026-12-12'}),{code:'period_not_mapped'});
});
test('preview does not substitute another supplier gallery or accept invalid money',()=>{
 const r=makePreview(snapshot,{results:[{propertyId:'imobsys-crcn-2-1149',apartmentImages:[{url:'https://reservascrcn.com.br/fotos/cr/imoveis/090-00109/fotos/a.JPG',kind:'apartment'}]}]});assert.equal(r.offers[0].images.length,0);
 assert.throws(()=>makePreview({periods:[{...snapshot.periods[0],offers:[{...offer,pixCents:0}]}]},{results:[]}));
});
