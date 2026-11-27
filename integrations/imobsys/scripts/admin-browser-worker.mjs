// Receives the documented browser Tab API. Never reads cookies, tokens or hidden credentials.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
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
 const control=process.env.IMOBSYS_WORKER_CONTROL_KEY
  ? {port:Number(process.env.IMOBSYS_WORKER_PORT||8012),controlKey:process.env.IMOBSYS_WORKER_CONTROL_KEY}
  : JSON.parse(await readFile(new URL('../data/admin-control.json',import.meta.url)));
 if(!Number.isInteger(control.port)||control.port<1024||control.port>65535||!/^[a-f0-9]{64}$/.test(control.controlKey||''))throw new Error('Configuração do executor inválida.');
 const origin=`http://127.0.0.1:${control.port}`;let stopped=false,lastFailure=null;
 const serverPort=Number(process.env.IMOBSYS_WORKER_SERVER_PORT||control.port);
 if(!Number.isInteger(serverPort)||serverPort<1024||serverPort>65535)throw new Error('Porta do serviço inválida.');
 const hostHeader=process.env.IMOBSYS_WORKER_HOST_HEADER||`127.0.0.1:${serverPort}`;
 if(!/^[a-zA-Z0-9.-]+(?::[1-9][0-9]{0,4})?$/.test(hostHeader))throw new Error('Host do serviço inválido.');
 const headers={'Host':hostHeader,'X-Local-Control':control.controlKey,'X-Worker-Id':randomUUID(),'Content-Type':'application/json'};
 const request=(path,options={})=>new Promise((resolve,reject)=>{const req=http.request(origin+path,{method:options.method||'GET',headers,timeout:10000},res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>2000000)req.destroy();});res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,json:async()=>JSON.parse(body)}));});req.on('timeout',()=>req.destroy());req.on('error',reject);req.end(options.body);});
 const heartbeat=setInterval(()=>{void request('/internal/browser/heartbeat').catch(()=>{});},5000);
 const run=async()=>{
  while(!stopped){
   try {
    const response=await request('/internal/browser/next');if(!response.ok)break;
    const {job}=await response.json();
    if(!job){await sleep(1000);continue;}
    let result,error;try{result=await queryThroughPanel(tab,job.query);}catch(e){error=true;lastFailure=String(e.message).slice(0,500);}
    await request('/internal/browser/result',{method:'POST',body:JSON.stringify({id:job.id,result,error})});
   }catch{if(!stopped)await sleep(1500);}
  }
 };
 const done=run().finally(()=>clearInterval(heartbeat));return {stop(){stopped=true;clearInterval(heartbeat);},diagnostics(){return {lastFailure};},done};
}
