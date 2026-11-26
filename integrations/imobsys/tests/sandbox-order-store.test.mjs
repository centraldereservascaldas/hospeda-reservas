import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSandboxOrderStore} from '../src/sandbox-order-store.mjs';

test('a fila de testes persiste e não aceita confirmar duas vezes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'imobsys-test-')),path=join(dir,'sandbox.sqlite');
 try {
  let store=openSandboxOrderStore(path);
  const item={id:'test1602',simulation:true,paymentVerified:true,reservationReference:'TESTE1602',propertyId:'imobsys-crcn-2-663',from:'2027-05-17',to:'2027-05-19',guests:2,amountCents:52300,method:'pix',paymentId:'fake-payment-1'};
  assert.throws(()=>store.recordPaid({...item,paymentVerified:false}));
  store.recordPaid(item); assert.throws(()=>store.recordPaid(item)); store.close();
  store=openSandboxOrderStore(path); assert.equal(store.listPending()[0].reservation_reference,'TESTE1602');
  assert.throws(()=>store.recordSupplierPayment('test1602','Operador teste',0,'REF'));
  store.recordSupplierPayment('test1602','Operador teste',50000,'REF-1'); assert.equal(store.listPending().length,0);
  assert.equal(store.get('test1602').supplier_paid_cents,50000);
  assert.equal(store.get('test1602').supplier_payment_reference,'REF-1');
  assert.equal(store.get('test1602').confirmed_by,'Operador teste');
  assert.throws(()=>store.recordSupplierPayment('test1602','Operador teste',50000,'REF-1')); store.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
