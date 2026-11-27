import {readFile,writeFile,rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
const target=new URL('../data/authenticated-availability.json',import.meta.url);
let previous={periods:[]};try{previous=JSON.parse(await readFile(target));}catch{}
const periods=new Map(previous.periods.map(p=>[`${p.from}/${p.to}`,p]));
const queries=[['2026-11-20','2026-11-22','Próximo fim de semana'],['2026-11-27','2026-11-29','Fim de novembro'],['2026-12-04','2026-12-06','Primeiro fim de semana de dezembro'],['2026-12-11','2026-12-13','Dezembro em Caldas'],['2026-12-18','2026-12-20','Antes do Natal'],['2026-12-24','2026-12-27','Natal'],['2026-12-31','2027-01-03','Réveillon'],['2027-01-15','2027-01-17','Férias de janeiro']];
for(const [from,to,label] of queries){
 try{
  const response=await fetch(`http://127.0.0.1:8012/api/admin/availability?${new URLSearchParams({from,to})}`,{signal:AbortSignal.timeout(70000)});
  const data=await response.json();if(!response.ok)throw new Error(data.code);
  periods.set(`${from}/${to}`,{...data.result,label});
  console.log(`${label}: ${data.result.count} ofertas; ${data.result.restrictions.length} restrições.`);
 }catch(e){console.log(`${label}: consulta não concluída (${e.message}); último resultado preservado.`);}
 const items=[...periods.values()];const snapshot={updatedAt:new Date().toISOString(),source:'authenticated-network-search',catalogueComplete:false,availabilityConfirmed:false,bookingEnabled:false,paymentEnabled:false,periods:items,uniqueReferences:new Set(items.flatMap(p=>p.offers.map(o=>o.id))).size};
 const temp=new URL('../data/authenticated-availability.next.json',import.meta.url);await writeFile(temp,JSON.stringify(snapshot,null,2));await rename(temp,target);
 await setTimeout(1000);
}
