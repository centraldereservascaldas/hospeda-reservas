import test from 'node:test';
import assert from 'node:assert/strict';
import {createCieloSandboxClient} from '../src/cielo-sandbox-client.mjs';

test('o Pix usa exclusivamente o endereço sandbox e o valor da cotação',async()=>{
 let request;
 const client=createCieloSandboxClient({merchantId:'123e4567-e89b-12d3-a456-426614174000',merchantKey:'fixture',fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify({Payment:{Status:12}}),{status:201});}});
 await client.createPix({merchantOrderId:'test1602',amountCents:52300,customerName:'Pessoa Teste',customerIdentity:'12345678901'});
 assert.equal(request.url,'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/');
 assert.equal(request.options.redirect,'error');
 assert.equal(JSON.parse(request.options.body).Payment.Amount,52300);
 assert.equal(JSON.parse(request.options.body).Payment.Type,'Pix');
});
test('dados inválidos não são enviados',async()=>{
 let called=false;
 const client=createCieloSandboxClient({merchantId:'123e4567-e89b-12d3-a456-426614174000',merchantKey:'fixture',fetchImpl:async()=>{called=true;}});
 await assert.rejects(client.createPix({merchantOrderId:'test',amountCents:0,customerName:'Teste'}));
 assert.equal(called,false);
});
test('cartão usa somente token e rejeita parcelas abaixo do mínimo',async()=>{
 let request;
 const client=createCieloSandboxClient({merchantId:'123e4567-e89b-12d3-a456-426614174000',merchantKey:'fixture',fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({Payment:{Status:2}}),{status:201});}});
 const data={merchantOrderId:'test1602',amountCents:63781,customerName:'Pessoa Teste',customerIdentity:'12345678901',paymentToken:'123e4567-e89b-12d3-a456-426614174000',installments:6};
 await client.createCard(data);
 assert.deepEqual(request.Payment.CreditCard,{PaymentToken:data.paymentToken});
 assert.equal(request.Payment.Provider,'Simulado');
 assert.equal(request.Payment.Amount,63781);
 await assert.rejects(client.createCard({...data,amountCents:2999}));
});
