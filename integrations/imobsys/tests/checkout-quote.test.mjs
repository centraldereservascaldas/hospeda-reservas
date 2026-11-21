import test from 'node:test';
import assert from 'node:assert/strict';
import {cardPricing, checkoutQuote} from '../src/checkout-quote.mjs';
import {prepareManualCheckout} from '../src/manual-checkout-handoff.mjs';

test('replica as seis faixas e o arredondamento do checkout existente',()=>{
  assert.deepEqual([1,2,3,4,5,6].map(n=>cardPricing(300100,n).totalCents),[319222,342972,342972,365976,365976,365976]);
});
test('o encaminhamento manual mantém valor, origem e reserva pendente e recusa cotação antiga',()=>{
  const now=Date.now();
  const q={propertyId:'imobsys-crcn-1-1149',from:'2027-11-19',to:'2027-11-21',guests:'4'};
  const r={...q,source:'authenticated-network-search',observedAt:new Date(now).toISOString(),offers:[{id:q.propertyId,pixCents:99400,condominium:'Flat',unit:'00109'}]};
  const quote=checkoutQuote(q,r), result=prepareManualCheckout(quote,{now});
  assert.equal(result.origin,'imobsys_manual');
  assert.equal(result.gateway,'cielo');
  assert.equal(result.quote.baseCents,99400);
  assert.equal(result.fulfillment.reservationConfirmed,false);
  assert.equal(result.paymentEnabled,false);
  assert.throws(()=>prepareManualCheckout(quote,{now:now+30001}),/consultada novamente/);
});
test('usa o valor final Pix do hóspede, não o valor do fornecedor',()=>{
  const q={propertyId:'imobsys-crcn-1-1149',from:'2027-11-19',to:'2027-11-21',guests:'4'};
  const r={...q,source:'authenticated-network-search',observedAt:'2026-11-18T12:00:00Z',offers:[{id:q.propertyId,pixCents:99400,supplierCents:79500,condominium:'Flat',unit:'00109'}]};
  const result=checkoutQuote(q,r);
  assert.equal(result.pix.totalCents,99400);
  assert.equal(result.card[0].baseCents,99400);
  assert.equal(result.paymentEnabled,false);
  assert.equal(result.reservationGuaranteed,false);
  assert.throws(()=>checkoutQuote(q,{...r,guests:'2'}),/não corresponde/);
  assert.throws(()=>checkoutQuote(q,{...r,offers:[]}),/Não encontramos/);
  assert.throws(()=>checkoutQuote({...q,guests:'1'},r),/hóspedes/);
});
