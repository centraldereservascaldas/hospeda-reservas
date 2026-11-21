import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReservationContext} from '../src/partner-reservation-context.mjs';
test('usa o código do fornecedor e rejeita datas ou valores divergentes',()=>{
 const data={'formReserva-totalDinheiro':'523','formReserva-totalCartao':'671','formReserva-entrada':'2027-05-17','formReserva-saida':'2027-05-19','formReserva-BaseConsulta':'tt','formReserva-unidadeParceiro':'663','formReserva-horaEntrada':'14','formReserva-horaSaida':'10'};
 const html=`<script>var data = '${JSON.stringify(data)}';</script>`;
 const expected={reference:'663',from:'2027-05-17',to:'2027-05-19',baseCents:52300};
 assert.equal(parseReservationContext(html,expected).BaseConsulta,'tt');
 assert.throws(()=>parseReservationContext(html,{...expected,baseCents:41800}));
 assert.throws(()=>parseReservationContext(html,{...expected,to:'2027-05-20'}));
});
