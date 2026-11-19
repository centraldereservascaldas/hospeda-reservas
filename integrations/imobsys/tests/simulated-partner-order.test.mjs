import test from 'node:test';
import assert from 'node:assert/strict';
import {simulatedPartnerOrder,advanceSimulatedOrder} from '../src/simulated-partner-order.mjs';

const now=Date.now();
const quote={provider:'imobsys-crcn',mode:'simulation-only',propertyId:'imobsys-crcn-1-1149',from:'2026-11-19',to:'2026-11-21',guests:4,pix:{totalCents:99400},observedAt:new Date(now).toISOString()};
test('pré-reserva, pagamento e confirmação manual são etapas independentes',()=>{
 let order=simulatedPartnerOrder(quote,{id:'local',now});
 assert.throws(()=>advanceSimulatedOrder(order,{type:'payment_verified',amountCents:99400,currency:'BRL',reference:'test'}));
 order=advanceSimulatedOrder(order,{type:'pre_reservation_created',reference:'simulado'});
 assert.throws(()=>advanceSimulatedOrder(order,{type:'payment_verified',amountCents:79500,currency:'BRL',reference:'test'}));
 order=advanceSimulatedOrder(order,{type:'payment_verified',amountCents:99400,currency:'BRL',reference:'test'});
 assert.equal(order.status,'awaiting_seller_confirmation');
 assert.throws(()=>advanceSimulatedOrder(order,{type:'seller_confirmed',operator:''}));
 assert.equal(advanceSimulatedOrder(order,{type:'seller_confirmed',operator:'vendedor'}).status,'confirmed');
});
test('recusa cotação expirada e impede confirmação de pagamento recusado',()=>{
 assert.throws(()=>simulatedPartnerOrder(quote,{id:'local',now:now+30001}));
 let order=simulatedPartnerOrder(quote,{id:'local',now});
 order=advanceSimulatedOrder(order,{type:'pre_reservation_created',reference:'simulado'});
 order=advanceSimulatedOrder(order,{type:'payment_declined'});
 assert.throws(()=>advanceSimulatedOrder(order,{type:'seller_confirmed',operator:'vendedor'}));
});
