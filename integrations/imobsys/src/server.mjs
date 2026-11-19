import http from 'node:http';
import { handleCheckoutHttp } from './checkout-http.mjs';
import { openCheckoutOperationStore } from './checkout-operation-store.mjs';
import { createPartnerCheckoutFlow } from './partner-checkout-flow.mjs';
import { createPartnerReservationClient } from './partner-reservation-client.mjs';
import { createCieloSandboxClient } from './cielo-sandbox-client.mjs';
import { reconcileSandboxPayment } from './sandbox-reconciliation.mjs';
import { inspectPartnerContract } from './partner-reservation-check.mjs';
import { parseReservationContext } from './partner-reservation-context.mjs';
import { openSandboxOrderStore } from './sandbox-order-store.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createAdminProvider, parseAdminAvailability } from './admin-provider.mjs';
import { createBrowserQueue } from './browser-query-queue.mjs';
import { makePreview } from './preview-data.mjs';
import { checkoutQuote, validateCheckoutQuery } from './checkout-quote.mjs';
import { prepareManualCheckout } from './manual-checkout-handoff.mjs';
import { createSessionReceiver } from './session-envelope.mjs';
import { fileURLToPath } from 'node:url';
import { createProvider, ConnectorError, validateDates, validateProperty } from './provider-http.mjs';
import { createCatalogProvider, validateMonth } from './catalog-provider.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8012);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta inválida.');
const properties = JSON.parse(await readFile(`${root}/properties.json`, 'utf8'));
for (const property of properties) validateProperty(property);
const provider = createProvider({ authorization: process.env.CNSP_AUTHORIZATION || '' });
const catalogProvider = createCatalogProvider(provider);
const adminProvider = createAdminProvider();
const browserQueue = createBrowserQueue();
const sessionReceiver = createSessionReceiver();
try {const previous=JSON.parse(await readFile(`${root}/data/admin-control.json`,'utf8'));if(previous.port===port&&/^[a-f0-9]{64}$/.test(previous.controlKey))sessionReceiver.controlKey=previous.controlKey;}catch{}
await mkdir(`${root}/data`,{recursive:true});
const sellerStore = openSandboxOrderStore(`${root}/data/sandbox-orders.sqlite`);
const operations=openCheckoutOperationStore(`${root}/data/checkout-operations.sqlite`);
const sandboxConfigured=!!process.env.CIELO_SANDBOX_MERCHANT_ID&&!!process.env.CIELO_SANDBOX_MERCHANT_KEY;
const cielo=sandboxConfigured?createCieloSandboxClient({merchantId:process.env.CIELO_SANDBOX_MERCHANT_ID,merchantKey:process.env.CIELO_SANDBOX_MERCHANT_KEY}):null;
const checkoutFlow=createPartnerCheckoutFlow({
 enabled:process.env.IMOBSYS_SANDBOX_FLOW_ENABLED==='true'&&sandboxConfigured,
 operations,sellerStore,cielo,
 reservations:createPartnerReservationClient({enabled:process.env.IMOBSYS_RESERVATION_CREATION_ENABLED==='true'}),
 quoteProvider:async input=>{
   const query=validateCheckoutQuery({propertyId:input.propertyId,from:input.from,to:input.to,guests:String(input.guests)});
   const search={from:query.from,to:query.to,guests:query.guests};
   const result=await (browserQueue.status().connected?browserQueue.query(search):adminProvider.availability(search));
   const quote=checkoutQuote(query,result);
   const parts=query.propertyId.split('-');
   const request=new URLSearchParams({Ajax:'Ajax',Controller:'parceiro',action:'buscaPrecos',periodo:`${query.from},${query.to}`,e1:'0',s1:'0',ImovRef:parts[3],BaseConsulta:parts[2]});
   const response=await fetch('https://reservascrcn.com.br/',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:request,signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Partner quote unavailable.');
   const fields=parseReservationContext(await response.text(),{reference:parts[3],from:query.from,to:query.to,baseCents:quote.pix.totalCents});
   input.reservationInput={...input.reservationInput,fields:{...fields,idCliente:input.reservationInput?.fields?.idCliente||'new'}};
   return quote;
 },
 verifyReservation:async(reservation,quote)=>{
   const response=await fetch(reservation.contractUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)return false;
   inspectPartnerContract(await response.text(),{reference:reservation.reference,baseCents:quote.pix.totalCents});
   return true;
 },
});
// Only a local bootstrap key and public encryption key are written. Never the upstream session.
await writeFile(`${root}/data/admin-control.json`,JSON.stringify({port,controlKey:sessionReceiver.controlKey,publicKey:sessionReceiver.publicKey}));

async function catalogSnapshot() {
  try { return JSON.parse(await readFile(`${root}/data/catalog.json`, 'utf8')); }
  catch { return { updatedAt: null, catalogueComplete: false, condominiums: [], scans: [], properties: [], calendar: null }; }
}

async function configuredProperties() {
  const snapshot = await catalogSnapshot();
  const combined = new Map(properties.map((property) => [property.id, property]));
  for (const property of snapshot.properties) { validateProperty(property); combined.set(property.id, property); }
  return [...combined.values()];
}
const cache = new Map();
let inFlight = 0;
let requests = 0;
let windowStarted = Date.now();

async function cached(key, ttl, run) {
  const item = cache.get(key);
  if (item && item.until > Date.now()) return item.value;
  if (inFlight >= 2) throw new ConnectorError('busy', 'Aguarde as consultas em andamento.', 429);
  inFlight++;
  try {
    const value = await run();
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { value, until: Date.now() + ttl });
    return value;
  } finally { inFlight--; }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  try {
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host)) return json(403, { success: false, code: 'host_not_allowed' });
    if (req.headers.origin && !hosts.some((host) => req.headers.origin === `http://${host}`)) return json(403, { success: false, code: 'origin_not_allowed' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if(await handleCheckoutHttp({req,res,url,authorize:request=>request.headers['x-local-control']===sessionReceiver.controlKey,flow:checkoutFlow,operations,sellerStore,reconcile:async item=>{if(!cielo)throw Error('Sandbox unavailable');await reconcileSandboxPayment({client:cielo,store:sellerStore,order:item.payload.order,paymentId:item.payload.paymentId});operations.advance(item.id,'awaiting_seller_confirmation',{});}}))return;
    if(['/seller-orders','/seller-orders.js'].includes(url.pathname)&&req.method==='GET') {
      const isScript=url.pathname.endsWith('.js');
      const content=await readFile(`${root}/public/seller-orders.${isScript?'js':'html'}`);
      res.writeHead(200,{'Content-Type':`${isScript?'text/javascript':'text/html'}; charset=utf-8`});return res.end(content);
    }
    if(url.pathname==='/internal/seller/orders') {
      if(req.method!=='GET')return json(405,{success:false,code:'read_only_service'});
      if(req.headers['x-local-control']!==sessionReceiver.controlKey)return json(403,{success:false,code:'control_denied'});
      return json(200,{success:true,environment:'sandbox',orders:sellerStore.listPending()});
    }
    if(url.pathname.startsWith('/internal/browser/')) {
      if(req.headers['x-local-control']!==sessionReceiver.controlKey)return json(403,{success:false,code:'control_denied'});
      if(!/^[a-f0-9-]{36}$/.test(req.headers['x-worker-id']||''))return json(403,{success:false,code:'worker_identity_required'});
      if(url.pathname==='/internal/browser/heartbeat'&&req.method==='GET'){browserQueue.heartbeat();return json(200,{success:true});}
      if(url.pathname==='/internal/browser/next'&&req.method==='GET')return json(200,{success:true,job:browserQueue.next()});
      if(url.pathname==='/internal/browser/result'&&req.method==='POST') {
        let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)throw new ConnectorError('body_too_large','Corpo acima do limite.',413);}
        const submission=JSON.parse(body),query=browserQueue.getQuery(submission.id);
        if(!query)return json(404,{success:false,code:'job_expired'});
        if(submission.error){browserQueue.submit(submission.id,null,true);return json(200,{success:true});}
        try {
          const raw=submission.result;
          if(raw.from!==query.from||raw.to!==query.to||!Array.isArray(raw.rows)||raw.rows.length>2000)throw new Error();
          const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
          const rows=raw.rows.map(row=>{if(row.cells.length!==6)throw new Error();return `<tr>${row.cells.slice(0,2).map(c=>`<td>${esc(c)}</td>`).join('')}<td><a href="${esc(row.href)}">${esc(row.cells[2])}</a></td>${row.cells.slice(3).map(c=>`<td>${esc(c)}</td>`).join('')}<td></td></tr>`;}).join('');
          const html=esc(raw.notices||'')+`<table>${rows}</table>`+(raw.empty?'Nenhum registro encontrado':'');
          browserQueue.submit(submission.id,parseAdminAvailability(html,query));
        }catch(error){browserQueue.submit(submission.id,null,error instanceof ConnectorError?error.code:'invalid_browser_result');}
        return json(200,{success:true});
      }
      return json(405,{success:false,code:'operation_not_allowed'});
    }
    if(url.pathname==='/internal/admin-session'&&req.method==='POST') {
      if(req.headers['x-local-control']!==sessionReceiver.controlKey)return json(403,{success:false,code:'control_denied'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>24000)throw new ConnectorError('body_too_large','Corpo acima do limite.',413);}
      let envelope;try{envelope=JSON.parse(body);}catch{throw new ConnectorError('invalid_json','Corpo inválido.',400);}
      adminProvider.configure(sessionReceiver.decode(envelope));
      return json(200,{success:true,session:adminProvider.status()});
    }
    if (req.method !== 'GET') return json(405, { success: false, code: 'read_only_service', message: 'Este serviço permite apenas consultas.' });
    if(url.pathname==='/api/admin/status')return json(200,{success:true,session:adminProvider.status(),browser:browserQueue.status()});
    const files = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'], '/previa':['public/preview.html','text/html'], '/fila-previa':['public/seller-preview.html','text/html'], '/seller-preview.css':['public/seller-preview.css','text/css'], '/preview.js':['public/preview.js','text/javascript'], '/preview.css':['public/preview.css','text/css'], '/brand-current.css':['public/brand-current.css','text/css'], '/assets/brand-mark.svg':['public/assets/brand-mark.svg','image/svg+xml'], '/assets/plus-jakarta-sans-latin.woff2':['public/assets/plus-jakarta-sans-latin.woff2','font/woff2'], '/assets/brand.png':['public/assets/brand.png','image/png'] };
    if (files[url.pathname]) {
      if(url.pathname==='/previa')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' https://reservascrcn.com.br; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      const [file, type] = files[url.pathname];
      const content = await readFile(`${root}/${file}`);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(content);
    }
    if (url.pathname === '/api/health') return json(200, { success: true, service: 'imobsys-connector-lab', mode: 'read-only', bookingEnabled: false, paymentEnabled: false });
    if(url.pathname==='/api/preview'){
      for(const key of url.searchParams.keys())if(!['from','to'].includes(key)||url.searchParams.getAll(key).length!==1)throw new ConnectorError('invalid_query','Parâmetro inválido.',400);
      let snapshot;try{snapshot=JSON.parse(await readFile(`${root}/data/authenticated-availability.json`,'utf8'));}catch{throw new ConnectorError('preview_not_mapped','Consulte os períodos no painel antes de abrir a prévia.',503);}
      const media=JSON.parse(await readFile(`${root}/data/media.json`,'utf8'));
      return json(200,{success:true,preview:makePreview(snapshot,media,Object.fromEntries(url.searchParams))});
    }
    if (url.pathname === '/api/properties') return json(200, { success: true, source: 'configured-and-observed-references', catalogueComplete: false, properties: await configuredProperties() });
    if (url.pathname === '/api/catalog') return json(200, { success: true, catalog: await catalogSnapshot() });
    if(url.pathname==='/api/integration/status'){
      try{const bundle=JSON.parse(await readFile(`${root}/data/integration-candidates.json`,'utf8'));return json(200,{success:true,schemaVersion:bundle.schemaVersion,generatedAt:bundle.generatedAt,coverage:bundle.coverage,productionConnected:false,bookingEnabled:false,paymentEnabled:false});}catch{return json(404,{success:false,code:'integration_not_prepared'});}
    }
    if (url.pathname === '/api/media') {
      try { return json(200, { success: true, media: JSON.parse(await readFile(`${root}/data/media.json`, 'utf8')) }); }
      catch { return json(404, { success: false, code: 'media_not_mapped' }); }
    }
    if (url.pathname === '/api/coverage') {
      try { return json(200, { success: true, coverage: JSON.parse(await readFile(`${root}/data/coverage.json`, 'utf8')) }); }
      catch { return json(404, { success: false, code: 'coverage_not_mapped' }); }
    }
    if (Date.now() - windowStarted >= 60000) { windowStarted = Date.now(); requests = 0; }
    if (++requests > 30) throw new ConnectorError('rate_limited', 'Limite de consultas locais atingido. Aguarde um minuto.', 429);
    if(url.pathname==='/api/checkout-quote') {
      for(const name of ['propertyId','from','to','guests'])if(url.searchParams.getAll(name).length!==1)throw new ConnectorError('invalid_query','Informe imóvel, datas e hóspedes uma vez.',400);
      for(const name of url.searchParams.keys())if(!['propertyId','from','to','guests'].includes(name))throw new ConnectorError('invalid_query','Parâmetro não permitido.',400);
      const query=validateCheckoutQuery(Object.fromEntries(url.searchParams));
      const request={from:query.from,to:query.to,guests:query.guests};
      const result=await cached(`checkout:${JSON.stringify(request)}`,10000,()=>browserQueue.status().connected?browserQueue.query(request):adminProvider.availability(request));
      const quote=checkoutQuote(query,result);
      return json(200,{success:true,quote,handoff:prepareManualCheckout(quote)});
    }
    if(url.pathname==='/api/admin/availability') {
      for(const name of ['from','to'])if(url.searchParams.getAll(name).length!==1)throw new ConnectorError('invalid_dates','Informe entrada e saída uma vez.',400);
      for(const name of url.searchParams.keys())if(!['from','to','unit','guests'].includes(name)||url.searchParams.getAll(name).length!==1)throw new ConnectorError('invalid_query','Parâmetro não permitido ou repetido.',400);
      const query=Object.fromEntries(url.searchParams);
      const key=`admin:${adminProvider.status().generation}:${JSON.stringify(query)}`;
      return json(200,{success:true,result:await cached(key,10000,()=>browserQueue.status().connected?browserQueue.query(query):adminProvider.availability(query))});
    }
    if (url.pathname === '/api/provider/status') return json(200, { success: true, provider: await cached('status', 60000, () => provider.status()) });
    if (url.pathname === '/api/calendar') {
      if (url.searchParams.getAll('month').length !== 1) throw new ConnectorError('invalid_month', 'Informe um mês uma única vez.', 400);
      const month = url.searchParams.get('month');
      validateMonth(month);
      return json(200, { success: true, calendar: await cached(`calendar:${month}`, 60000, () => catalogProvider.calendar(month)) });
    }
    if (url.pathname === '/api/availability') {
      if (url.searchParams.getAll('from').length !== 1 || url.searchParams.getAll('to').length !== 1) throw new ConnectorError('invalid_dates', 'Informe entrada e saída uma única vez.', 400);
      const { from, to } = validateDates(url.searchParams.get('from'), url.searchParams.get('to'));
      const propertyId = url.searchParams.get('propertyId');
      if (url.searchParams.getAll('propertyId').length > 1) throw new ConnectorError('invalid_property', 'Informe o imóvel uma única vez.', 400);
      if (propertyId && !/^[A-Za-z0-9_-]{1,100}$/.test(propertyId)) throw new ConnectorError('invalid_property', 'Imóvel inválido.', 400);
      const result = await cached(`offers:${from}:${to}`, 30000, () => catalogProvider.offers(from, to));
      if (!propertyId) return json(200, { success: true, result });
      const offer = result.offers.find((item) => item.id === propertyId) || null;
      return json(200, { success: true, result: { from, to, observedAt: result.observedAt, propertyId, status: offer ? 'offered-by-supplier' : 'not-observed', offer, availabilityConfirmed: false, bookingEnabled: false, paymentEnabled: false, warning: offer ? 'Oferta encontrada para o período, sem bloqueio ou confirmação de estoque.' : 'Ausência da oferta não comprova indisponibilidade.' } });
    }
    const match = url.pathname.match(/^\/api\/properties\/([A-Za-z0-9_-]+)\/(details|quote)$/);
    if (!match) return json(404, { success: false, code: 'not_found' });
    const property = (await configuredProperties()).find((item) => item.id === match[1]);
    if (!property) return json(404, { success: false, code: 'property_not_configured' });
    if (match[2] === 'details') return json(200, { success: true, property: await cached(`property:${property.id}`, 300000, () => provider.property(property)) });
    if (url.searchParams.getAll('from').length !== 1 || url.searchParams.getAll('to').length !== 1) throw new ConnectorError('invalid_dates', 'Informe entrada e saída uma única vez.', 400);
    const { from, to } = validateDates(url.searchParams.get('from'), url.searchParams.get('to'));
    const quote = await cached(`quote:${property.id}:${from}:${to}`, 30000, () => provider.quote(property, from, to));
    return json(200, { success: true, quote });
  } catch (error) {
    if (error instanceof ConnectorError) return json(error.status, { success: false, code: error.code, message: error.message });
    return json(500, { success: false, code: 'internal_error', message: 'Não foi possível concluir a consulta local.' });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Conector ImobSys somente leitura: http://127.0.0.1:${port}`));
