import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReservationRows } from '../src/reservation-read.mjs';

const query={from:'2027-05-17',to:'2027-05-19'};
test('retorna apenas campos necessários, sem vazar dados pessoais',()=>{
 const response=normalizeReservationRows([{id:'1605',unit:'B0604',checkIn:'2027-05-17',checkOut:'2027-05-19',customer:'Pessoa',cpf:'123',amount:123}],query);
 assert.deepEqual(response.data,[{id:'1605',unit:'B0604',checkIn:'2027-05-17',checkOut:'2027-05-19'}]);
 assert.equal(response.complete,false);
});
test('recusa dados incompletos e identificadores repetidos',()=>{
 assert.throws(()=>normalizeReservationRows([{id:'x'}],query));
 const row={id:'1',unit:'A',checkIn:'2027-05-17',checkOut:'2027-05-19'};
 assert.throws(()=>normalizeReservationRows([row,row],query));
});
