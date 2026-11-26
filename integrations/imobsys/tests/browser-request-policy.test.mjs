import test from 'node:test';import assert from 'node:assert/strict';import {allowBrowserRequest} from '../src/browser-request-policy.mjs';
const url='https://app.reservascrcn.com.br/Ajax.php';
test('isolated browser permits manual login and the two observed read-only operations',()=>{
 assert.equal(allowBrowserRequest({url:'https://app.reservascrcn.com.br/login',method:'POST'}),true);
 for(const action of ['getOrcamentoRede','newSugestao_saida'])assert.equal(allowBrowserRequest({url,method:'POST',body:`Controller=hospedagem&Action=${action}`}),true);
});
test('isolated browser blocks reservations, payment, guest lookup, unknown origins and duplicate actions',()=>{
 for(const action of ['createHospedagem','gerarPix','reservarImovelParceiro','gerarLink','altera_hosp'])assert.equal(allowBrowserRequest({url,method:'POST',body:`Controller=hospedagem&Action=${action}`}),false);
 assert.equal(allowBrowserRequest({url,method:'POST',body:'Controller=hospedagem&Action=getOrcamentoRede&Action=createHospedagem'}),false);
 assert.equal(allowBrowserRequest({url:'https://evil.example/Ajax.php',method:'POST',body:'Controller=hospedagem&Action=getOrcamentoRede'}),false);
 assert.equal(allowBrowserRequest({url:'https://app.reservascrcn.com.br/hospedagem/create',method:'GET'}),false);
});
