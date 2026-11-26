import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handleCheckoutHttp} from '../src/checkout-http.mjs';
async function invoke(path,input,authorized=true){let output,status,calls=0;const req=Readable.from([JSON.stringify(input)]);req.method='POST';const res={writeHead:s=>status=s,end:body=>output=JSON.parse(body)};await handleCheckoutHttp({req,res,url:new URL(path,'http://localhost'),authorize:()=>authorized,flow:{start:async data=>{calls++;return {orderId:data.id,status:'payment_pending',simulation:true};}},operations:{get:()=>null},sellerStore:{confirm:()=>{calls++;}},reconcile:async()=>{calls++;}});return {status,output,calls};}
test('endpoints exigem autorização antes de iniciar qualquer operação',async()=>{const result=await invoke('/internal/checkout/start',{id:'test'},false);assert.equal(result.status,403);assert.equal(result.calls,0);});
test('o endpoint de início chama o fluxo uma única vez',async()=>{const result=await invoke('/internal/checkout/start',{id:'test'});assert.equal(result.status,201);assert.equal(result.calls,1);assert.equal(result.output.status,'payment_pending');});
test('conciliação recusa pedido sem tentativa persistida',async()=>{const result=await invoke('/internal/checkout/reconcile',{id:'missing'});assert.equal(result.status,409);assert.equal(result.calls,0);});
test('registro manual encaminha responsável, valor e referência',async()=>{
 let received,output,status;const req=Readable.from([JSON.stringify({id:'ORDER1',operator:'Operador',amountCents:52300,reference:'REF1'})]);req.method='POST';
 const res={writeHead:s=>status=s,end:body=>output=JSON.parse(body)};
 await handleCheckoutHttp({req,res,url:new URL('/internal/checkout/seller-confirm','http://localhost'),authorize:()=>true,operations:{},sellerStore:{recordSupplierPayment:(...args)=>{received=args;}}});
 assert.equal(status,200);assert.equal(output.environment,'sandbox');assert.deepEqual(received,['ORDER1','Operador',52300,'REF1']);
});
