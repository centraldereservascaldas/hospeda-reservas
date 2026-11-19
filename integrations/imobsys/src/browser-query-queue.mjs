import {randomUUID} from 'node:crypto';
import {ConnectorError,validateDates} from './provider-http.mjs';
export function createBrowserQueue() {
 let workerSeen=0;const pending=new Map();const waiting=[];
 return {
  heartbeat(){workerSeen=Date.now();},
  status(){return {connected:Date.now()-workerSeen<15000,transport:'authenticated-browser-ui',pending:pending.size};},
  next(){workerSeen=Date.now();while(waiting.length){const id=waiting.shift();const item=pending.get(id);if(item)return {id,query:item.query};}return null;},
  submit(id,result,error){const item=pending.get(id);if(!item)return false;pending.delete(id);clearTimeout(item.timer);if(error){const code=['admin_unrecognized','admin_period_mismatch','invalid_price','admin_upstream_error','invalid_browser_result'].includes(error)?error:'browser_query_failed';item.reject(new ConnectorError(code,'A consulta no painel não pôde ser validada.'));}else item.resolve(result);return true;},
  query(input){
   const {from,to}=validateDates(input.from,input.to);const unit=input.unit||'',guests=input.guests||'';
   if(!/^[A-Za-z0-9 -]{0,30}$/.test(unit)||guests&&!/^(?:[2-9]|10)$/.test(guests))throw new ConnectorError('invalid_query','Filtros inválidos.',400);
   if(Date.now()-workerSeen>=15000)throw new ConnectorError('browser_worker_required','Conecte o executor do painel autenticado.',503);
   if(pending.size>=4)throw new ConnectorError('busy','Aguarde as consultas do painel.',429);
   const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new ConnectorError('browser_timeout','A consulta no painel expirou.'));},60000);pending.set(id,{query:{from,to,unit,guests},resolve,reject,timer});waiting.push(id);});
  },
  getQuery(id){return pending.get(id)?.query||null;},
 };
}
