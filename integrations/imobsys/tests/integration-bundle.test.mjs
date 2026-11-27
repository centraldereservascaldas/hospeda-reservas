import test from 'node:test';import assert from 'node:assert/strict';
import {buildIntegrationBundle} from '../src/integration-bundle.mjs';
const property={id:'imobsys-crcn-1-1149',base:'1',reference:'1149',title:'Flat | 00109',condominium:'Flat',unit:'00109',description:'01 quarto #geladeira #tela',capacityText:'Para até 4 Pessoas + 1 criança até 5 anos'};
const period={from:'2026-12-04',to:'2026-12-06',guests:null,observedAt:'2026-11-18T12:00:00Z',offers:[{...property,pixCents:99400}],source:'authenticated-network-search'};
const input={catalog:{properties:[property]},partner:{properties:[]},curated:{periods:[period]},rolling:{scans:[{success:true}],periods:[period,{...period,from:'2026-12-11',to:'2026-12-13',offers:[]}]},media:{results:[]}};
test('integration export keeps unknown fields nullable and checkout unpublished',()=>{
 const result=buildIntegrationBundle(input);const p=result.listings[0];assert.equal(p.siteCandidate.maxGuests,4);assert.equal(p.siteCandidate.bedrooms,1);assert.equal(p.siteCandidate.rating,null);assert.equal(p.siteCandidate.pricePerNight,null);assert.equal(p.price,null);assert.equal(p.datedQuotes[0].pixCents,99400);assert.equal(p.publication.enabled,false);assert.equal(result.productionConnected,false);assert.equal('staysListingId' in p.siteCandidate,false);assert.equal(p.queryObservations[1].status,'not-observed');assert.equal(p.queryObservations[1].absenceMeans,'unknown');
});
test('newer quote replaces only the exact same date and guest context',()=>{
 const result=buildIntegrationBundle({...input,rolling:{periods:[{...period,observedAt:'2026-11-18T13:00:00Z',offers:[{...property,pixCents:110000}]},{...period,guests:'4',offers:[{...property,pixCents:120000}]}]}});
 const quotes=result.listings[0].datedQuotes;assert.equal(quotes.length,2);assert.equal(quotes.find(q=>q.guests===null).pixCents,110000);assert.equal(quotes.find(q=>q.guests==='4').pixCents,120000);
});
test('identity conflicts and invalid prices fail instead of mixing supplier data',()=>{
 assert.throws(()=>buildIntegrationBundle({...input,catalog:{properties:[{...property,id:'imobsys-crcn-2-1149'}]}}));
 assert.throws(()=>buildIntegrationBundle({...input,curated:{periods:[{...period,offers:[{...property,pixCents:-1}]}]}}));
});
test('same supplier reference in another base remains a separate candidate',()=>{
 const other={...property,id:'imobsys-crcn-2-1149',base:'2'};const result=buildIntegrationBundle({...input,partner:{properties:[other]}});assert.equal(result.listings.length,2);assert.equal(result.listings.find(p=>p.id===other.id).publication.scope,'internal-network-review-required');
});
