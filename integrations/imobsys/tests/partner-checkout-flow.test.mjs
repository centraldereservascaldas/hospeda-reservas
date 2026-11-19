import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartnerCheckoutFlow} from '../src/partner-checkout-flow.mjs';
import {openCheckoutOperationStore} from '../src/checkout-operation-store.mjs';
import {openSandboxOrderStore} from '../src/sandbox-order-store.mjs';
for(const method of ['pix','card'])test(`cotação, pré-reserva, ${method} e fila persistente conectados`,async()=>{
 const operations=openCheckoutOperationStore(':memory:'),sellerStore=openSandboxOrderStore(':memory:');
 const input={id:'test'+method,propertyId:'imobsys-crcn-2-663',from:'2027-05-17',to:'2027-05-19',guests:2,acceptedBaseCents:52300,method,installments:6,customer:{name:'Teste',cpf:'12345678901'},reservationInput:{}};
 let amount;
 const id='123e4567-e89b-12d3-a456-426614174000';
 const charge=async x=>{amount=x.amountCents;return {Payment:{PaymentId:id,Status:2}};};
 const flow=createPartnerCheckoutFlow({enabled:true,operations,sellerStore,quoteProvider:async()=>({...input,provider:'imobsys-crcn',pix:{totalCents:52300}}),reservations:{create:async()=>({reference:'TESTE999'})},verifyReservation:async()=>true,cielo:{createPix:charge,createCard:charge,findPayment:async()=>({MerchantOrderId:input.id,Payment:{PaymentId:id,Status:2,Amount:amount,Currency:'BRL',Type:method==='pix'?'Pix':'CreditCard'}})}});
 const result=await flow.start(input);assert.equal(result.status,'awaiting_seller_confirmation');assert.equal(sellerStore.listPending().length,1);await assert.rejects(flow.start(input));assert.equal(operations.get(input.id).state,'awaiting_seller_confirmation');operations.close();sellerStore.close();
});
