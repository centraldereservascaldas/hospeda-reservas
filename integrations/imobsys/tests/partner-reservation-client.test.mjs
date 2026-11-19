import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartnerReservationClient} from '../src/partner-reservation-client.mjs';
const input={fields:{idImovel:'663',BaseConsulta:'2',entrada:'2027-05-17',saida:'2027-05-19',horaEntrada:'14',horaSaida:'10',totalCartao:'671',totalDinheiro:'523'},customer:{name:'Pessoa Teste',cpf:'12345678901',phone:'64999999999'}};
test('a criação é desligada por padrão',async()=>{let calls=0;const c=createPartnerReservationClient({fetchImpl:async()=>{calls++;}});await assert.rejects(c.create(input));assert.equal(calls,0);});
test('usa somente a ação observada e exige um contrato único',async()=>{let calls=0;const c=createPartnerReservationClient({enabled:true,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://reservascrcn.com.br/');assert.equal(options.body.get('Action'),'reservarImovelParceiro');return new Response('<script>location.href="/contrato/999/0"</script>');}});assert.equal((await c.create(input)).reference,'999');assert.equal(calls,1);});
test('resultado incerto nunca repete o POST',async()=>{let calls=0;const c=createPartnerReservationClient({enabled:true,fetchImpl:async()=>{calls++;throw Error('timeout');}});await assert.rejects(c.create(input),{code:'reservation_result_unknown'});assert.equal(calls,1);});
