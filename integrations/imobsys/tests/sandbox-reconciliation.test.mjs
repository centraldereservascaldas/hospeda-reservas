import test from 'node:test';
import assert from 'node:assert/strict';
import {createCieloSandboxClient} from '../src/cielo-sandbox-client.mjs';
import {openSandboxOrderStore} from '../src/sandbox-order-store.mjs';
import {reconcileSandboxPayment} from '../src/sandbox-reconciliation.mjs';

for (const method of ['pix','card']) test(`concilia ${method} consultado na Cielo antes da fila`,async()=>{
 const store=openSandboxOrderStore(':memory:');
 const order={id:'test'+method,merchantOrderId:'test'+method,simulation:true,reservationReference:'TESTE1602',propertyId:'imobsys-crcn-2-663',from:'2027-05-17',to:'2027-05-19',guests:2,amountCents:method==='pix'?52300:63781,method};
 const paymentId='123e4567-e89b-12d3-a456-426614174000';
 let status=12;
 const client=createCieloSandboxClient({merchantId:paymentId,merchantKey:'fixture',fetchImpl:async url=>{
   assert.equal(url,`https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/${paymentId}`);
   return new Response(JSON.stringify({MerchantOrderId:order.merchantOrderId,Payment:{PaymentId:paymentId,Status:status,Amount:order.amountCents,Currency:'BRL',Type:method==='pix'?'Pix':'CreditCard'}}));
 }});
 await assert.rejects(reconcileSandboxPayment({client,store,order,paymentId}));
 assert.equal(store.listPending().length,0); status=2;
 await reconcileSandboxPayment({client,store,order,paymentId});
 assert.equal(store.listPending()[0].amount_cents,order.amountCents); store.close();
});
