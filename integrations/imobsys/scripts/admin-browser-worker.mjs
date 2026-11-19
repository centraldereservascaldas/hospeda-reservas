// Receives the documented browser Tab API. Never reads cookies, tokens or hidden credentials.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function queryThroughPanel(tab,query) {
 const location=new URL(await tab.url());
 if(location.origin!=='https://app.reservascrcn.com.br'||location.pathname!=='/hospedagem/orcamentoRede')throw new Error('Panel session required');
 for(let attempt=0;attempt<2;attempt++) {
  await tab.playwright.locator('#unidade').fill(query.unit);
  const current=await tab.playwright.evaluate(()=>({from:document.querySelector('#entrada')?.value}));
  if(current.from!==query.from){await tab.playwright.locator('#entrada').fill(query.from);await tab.playwright.locator('#unidade').click();}
  await tab.playwright.locator('#saida').fill(query.to);
  await tab.playwright.locator('#selectPax').selectOption(query.guests||'all');
  try{await tab.playwright.getByRole('button',{name:'Buscar',exact:true}).click();}catch{
   const pending=await tab.playwright.evaluate(()=>document.querySelector('#returnAjax_Lista')?.innerText.includes('Aguarde'));
   if(!pending)await tab.playwright.getByRole('button',{name:'Buscar',exact:true}).click();
  }
  await tab.playwright.locator('#returnAjax_Lista table').waitFor({state:'visible',timeout:45000});
  const result=await tab.playwright.evaluate(()=>{
   const root=document.querySelector('#returnAjax_Lista');
   return {from:document.querySelector('#entrada')?.value,to:document.querySelector('#saida')?.value,
    rows:Array.from(root.querySelectorAll('tbody tr')).filter(r=>r.querySelector('a[href*="/parceiro/"]')).map(r=>({cells:Array.from(r.cells).slice(0,6).map(c=>c.innerText.trim()),href:r.querySelector('a[href*="/parceiro/"]')?.getAttribute('href')})),
    notices:root.innerText.split('Pesquisar')[0].slice(0,2000),empty:/Nenhum registro encontrado|Sem imoveis na REDE/i.test(root.innerText)};
  });
  if(result.from===query.from&&result.to===query.to)return result;
 }
 throw new Error('Panel changed dates');
}
export async function startBrowserWorker(tab) {
 const control=JSON.parse(await readFile(new URL('../data/admin-control.json',import.meta.url)));
 const origin=`http://127.0.0.1:${control.port}`;let stopped=false,lastFailure=null;
 const headers={'X-Local-Control':control.controlKey,'X-Worker-Id':randomUUID(),'Content-Type':'application/json'};
 const heartbeat=setInterval(()=>{void fetch(origin+'/internal/browser/heartbeat',{headers}).catch(()=>{});},5000);
 const run=async()=>{
  while(!stopped){
   try {
    const response=await fetch(origin+'/internal/browser/next',{headers});if(!response.ok)break;
    const {job}=await response.json();
    if(!job){await sleep(1000);continue;}
    let result,error;try{result=await queryThroughPanel(tab,job.query);}catch(e){error=true;lastFailure=String(e.message).slice(0,500);}
    await fetch(origin+'/internal/browser/result',{method:'POST',headers,body:JSON.stringify({id:job.id,result,error})});
   }catch{if(!stopped)await sleep(1500);}
  }
 };
 const done=run().finally(()=>clearInterval(heartbeat));return {stop(){stopped=true;clearInterval(heartbeat);},diagnostics(){return {lastFailure};},done};
}
