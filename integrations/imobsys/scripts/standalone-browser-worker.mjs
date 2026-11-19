import {createRequire} from 'node:module';
import {startBrowserWorker} from './admin-browser-worker.mjs';
import {allowBrowserRequest} from '../src/browser-request-policy.mjs';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{
 const runtime=process.env.IMOBSYS_PLAYWRIGHT_MODULE;
 if(!runtime)throw new Error('Instale Playwright localmente ou configure IMOBSYS_PLAYWRIGHT_MODULE.');
 playwright=require(runtime);
}
const origin='https://app.reservascrcn.com.br';
const browser=await playwright.chromium.launch({channel:'chrome',headless:false,args:['--window-size=1280,900','--window-position=40,40']});
const context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:false,serviceWorkers:'block'});
// The operator and worker share authentication, but only the worker is subject
// to the strict read-only network policy. The operator retains the normal UI.
const operatorPage=await context.newPage();
const page=await context.newPage();
await page.route('**/*',async route=>{
 const request=route.request();
 return allowBrowserRequest({url:request.url(),method:request.method(),body:request.postData()||''})?route.continue():route.abort();
});
const tab={url:async()=>page.url(),playwright:page};
await operatorPage.goto(origin+'/hospedagem/orcamentoRede');
await page.goto(origin+'/hospedagem/orcamentoRede');
await operatorPage.bringToFront();
let worker=null,lastState='',lastDiagnostic='';
let nextLoginCheck=Date.now()+15000;
const announce=state=>{if(state!==lastState){console.log(state);lastState=state;}};
process.on('SIGINT',async()=>{worker?.stop();await browser.close();process.exit(0);});
while(browser.isConnected()){
 try{
  if(page.isClosed()){worker?.stop();await browser.close();break;}
  if(new URL(page.url()).pathname==='/login'){
   worker?.stop();worker=null;announce('Login necessário na janela de consulta ImobSys. Sessão somente em memória.');
   // Login in the operator tab updates this context's cookies. Refresh only
   // the worker tab so it can detect that login without disturbing the user.
   if(Date.now()>=nextLoginCheck){nextLoginCheck=Date.now()+15000;await page.goto(origin+'/hospedagem/orcamentoRede');}
  }else{
   if(new URL(page.url()).pathname!=='/hospedagem/orcamentoRede')await page.goto(origin+'/hospedagem/orcamentoRede');
   if(!worker&&new URL(page.url()).pathname==='/hospedagem/orcamentoRede'){
    await page.waitForLoadState('networkidle',{timeout:15000});
    await page.getByRole('button',{name:'Buscar',exact:true}).waitFor({state:'visible',timeout:15000});
    worker=await startBrowserWorker(tab);const active=worker;void active.done.then(()=>{if(worker===active)worker=null;});announce('Executor independente conectado: somente consultas de disponibilidade.');
   }
  }
  const diagnostic=worker?.diagnostics().lastFailure;
  if(diagnostic&&diagnostic!==lastDiagnostic){console.log('Diagnóstico do executor: '+diagnostic);lastDiagnostic=diagnostic;}
 }catch{announce('Executor aguardando painel ou sessão.');}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
worker?.stop();
