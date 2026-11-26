import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPartnerContract} from '../src/partner-reservation-check.mjs';

const html='<h1>COD ALUGUEL: 1602</h1><div>VALOR DO ALUGUEL: R$ 523,00</div><p>Sua pré-reserva expira em breve</p>';
test('confere referência e total da pré-reserva observada sem habilitar cobrança',()=>{
 assert.deepEqual(inspectPartnerContract(html,{reference:'1602',baseCents:52300}),{reference:'1602',baseCents:52300,status:'pre_reservation_observed',reservationGuaranteed:false,paymentEnabled:false});
 assert.throws(()=>inspectPartnerContract(html,{reference:'1603',baseCents:52300}));
 assert.throws(()=>inspectPartnerContract(html,{reference:'1602',baseCents:41800}));
 assert.throws(()=>inspectPartnerContract(html.replace('Sua pré-reserva expira','Reserva confirmada'),{reference:'1602',baseCents:52300}));
 assert.throws(()=>inspectPartnerContract('Reserva cancelada '+html,{reference:'1602',baseCents:52300}));
});
