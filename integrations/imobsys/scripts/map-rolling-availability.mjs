import {readFile,writeFile,rename} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
const now=new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const part=n=>parts.find(p=>p.type===n).value;
const today=`${part('year')}-${part('month')}-${part('day')}`;
const dateAt=offset=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const path=new URL('../data/rolling-availability.json',import.meta.url);let old={periods:[]};try{old=JSON.parse(await readFile(path));}catch{}
const periods=new Map(old.periods.map(p=>[`${p.from}/${p.to}`,p]));const scans=[];let failures=0;
for(let offset=1;offset<=14;offset++){
 const from=dateAt(offset),to=dateAt(offset+2);
 try{
  const response=await fetch(`http://127.0.0.1:8012/api/admin/availability?${new URLSearchParams({from,to})}`,{signal:AbortSignal.timeout(70000)});const data=await response.json();if(!response.ok)throw new Error(data.code);
  periods.set(`${from}/${to}`,data.result);scans.push({from,to,success:true,count:data.result.count});failures=0;console.log(`${from} a ${to}: ${data.result.count} ofertas.`);
 }catch(error){scans.push({from,to,success:false,code:error.message});failures++;console.log(`${from}: consulta preservada como desconhecida.`);}
 const snapshot={updatedAt:new Date().toISOString(),source:'authenticated-network-search',coverage:'14-arrival-dates-with-two-night-stays',nights:2,guests:null,catalogueComplete:false,dailyOccupancyConfirmed:false,periods:[...periods.values()],scans};
 const temp=new URL('../data/rolling-availability.next.json',import.meta.url);await writeFile(temp,JSON.stringify(snapshot,null,2));await rename(temp,path);
 if(failures>=2){console.log('Duas falhas consecutivas; varredura interrompida e evidência anterior preservada.');break;}
 await setTimeout(1000);
}
