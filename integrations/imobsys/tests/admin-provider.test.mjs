import test from 'node:test';import assert from 'node:assert/strict';
import {createAdminProvider,parseAdminAvailability} from '../src/admin-provider.mjs';
import {createSessionReceiver} from '../src/session-envelope.mjs';
import {publicEncrypt,createPublicKey,constants,randomBytes,createCipheriv} from 'node:crypto';
const query={from:'2026-11-19',to:'2026-11-21'};
const html='<table><tr><td>cr</td><td>FLAT</td><td><a href="https://reservascrcn.com.br/parceiro/1/1149?19-11-2026,21-11-2026,CALDASIN,">00109</a></td><td>Quarto</td><td>4 Pessoas</td><td>1.274,00 Cartão 994,00 Pix 497,00 Entrada 795,00 Pagar</td><td><button>Alugar</button></td></tr></table>';
const context={Base:'test',User:'test-user',UserId:'1',Token:'test-token',Ambiente:'test'};
test('parses final guest Pix amount and never mistakes supplier payable amount for guest price',()=>{
 const r=parseAdminAvailability(html,query);assert.equal(r.offers[0].pixCents,99400);assert.equal(r.count,1);assert.equal(r.bookingEnabled,false);assert.equal(r.availabilityConfirmed,false);
});
test('distinguishes explicit minimum stay from missing offers and rejects login/errors',()=>{
 assert.equal(parseAdminAvailability('cr: Min de 2 Noites Nenhum registro encontrado',query).status,'restricted');
 assert.equal(parseAdminAvailability('Nenhum registro encontrado',query).status,'not-observed');
 assert.throws(()=>parseAdminAvailability('<form>Login</form>',query));
 assert.throws(()=>parseAdminAvailability('Fatal error',query));
 assert.throws(()=>parseAdminAvailability(html+html,query));
 assert.throws(()=>parseAdminAvailability(html,{from:'2026-11-20',to:'2026-11-22'}),{code:'admin_period_mismatch'});
});
test('authenticated transport allows only the known search operation and expires memory context',async()=>{
 let current=0,calls=0;
 const p=createAdminProvider({now:()=>current,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://app.reservascrcn.com.br/Ajax.php');assert.equal(options.redirect,'manual');
  const b=options.body;assert.equal(b.get('Action'),'getOrcamentoRede');assert.equal(b.get('Controller'),'hospedagem');assert.equal(b.get('dataPost[entrada]'),query.from);assert.equal(b.get('dataPost[whatsapp]'),'');assert.equal(b.has('idCliente'),false);return new Response(html);
 }});
 await assert.rejects(()=>p.availability(query),{code:'admin_session_required'});p.configure(context);
 const r=await p.availability({...query,Action:'createHospedagem'});assert.equal(r.count,1);assert.equal(calls,1);assert.equal(JSON.stringify(p.status()).includes(context.Token),false);
 current=1800001;await assert.rejects(()=>p.availability(query),{code:'admin_session_required'});
});
test('session envelopes detect modification and keep session plaintext off the transport',()=>{
 const receiver=createSessionReceiver(),key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(context)),cipher.final(),cipher.getAuthTag()]);
 const wrappedKey=publicEncrypt({key:createPublicKey({key:Buffer.from(receiver.publicKey,'base64'),type:'spki',format:'der'}),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
 const envelope={version:1,wrappedKey:wrappedKey.toString('base64'),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64')};
 assert.deepEqual(receiver.decode(envelope),context);assert.equal(JSON.stringify(envelope).includes(context.Token),false);
 assert.throws(()=>receiver.decode({...envelope,ciphertext:Buffer.from('tampered').toString('base64')}));
});
