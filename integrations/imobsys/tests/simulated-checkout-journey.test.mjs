import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulatedCheckoutJourney} from '../src/simulated-checkout-journey.mjs';
const now=Date.now();
const quote={provider:'imobsys-crcn',mode:'simulation-only',propertyId:'imobsys-crcn-1-1149',from:'2026-11-19',to:'2026-11-21',guests:4,pix:{totalCents:99400},observedAt:new Date(now).toISOString()};
test('cartão usa valor parcelado, confirma pagamento e aguarda o vendedor',async()=>{
 const journey=createSimulatedCheckoutJourney({reserve:async()=>({status:'created',reference:'PRE-TESTE'}),charge:async x=>({status:'approved',amountCents:x.amountCents,currency:x.currency,reference:'PAY-TESTE'})});
 const result=await journey.start({id:'test-1',quote,method:'card',installments:6,now});
 assert.equal(result.total,121220);
 assert.equal(result.phase,'awaiting_seller_confirmation');
 assert.equal(journey.sellerQueue()[0].reservationReference,'PRE-TESTE');
 assert.equal(journey.confirm('test-1','Vendedor').phase,'confirmed');
 assert.equal(journey.sellerQueue().length,0);
 await assert.rejects(journey.start({id:'test-1',quote,method:'pix',now}));
});
test('não cobra após reserva incerta e não confirma pagamento divergente',async()=>{
 let calls=0;
 const unavailable=createSimulatedCheckoutJourney({reserve:async()=>{throw Error('timeout');},charge:async()=>{calls++;}});
 assert.equal((await unavailable.start({id:'a',quote,method:'pix',now})).phase,'reservation_result_unknown'); assert.equal(calls,0);
 const mismatch=createSimulatedCheckoutJourney({reserve:async()=>({status:'created',reference:'PRE'}),charge:async()=>({status:'approved',amountCents:79500,currency:'BRL',reference:'PAY'})});
 assert.equal((await mismatch.start({id:'b',quote,method:'pix',now})).phase,'payment_pending_or_unverified');
 assert.throws(()=>mismatch.confirm('b','Vendedor'));
});
