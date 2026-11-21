import { ConnectorError, htmlToText, moneyToCents, validateDates } from './provider-http.mjs';

export function parseAdminAvailability(html, query) {
  const text = htmlToText(html);
  if (/Fatal error|Uncaught|Stack trace:/i.test(text)) throw new ConnectorError('admin_upstream_error', 'A consulta autenticada retornou uma falha.');
  const offers = new Map();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length !== 7) continue;
    const href = cells[2].match(/href=["']([^"']*\/parceiro\/\d+\/\d+[^"']*)["']/i)?.[1];
    if (!href) continue;
    let u; try { u = new URL(href); } catch { throw new ConnectorError('admin_unrecognized', 'Identidade de oferta inválida.'); }
    const identity = u.pathname.match(/^\/parceiro\/([1-9]\d*)\/([1-9]\d*)$/);
    if (u.origin !== 'https://reservascrcn.com.br' || !identity) throw new ConnectorError('admin_unrecognized', 'Origem de oferta inválida.');
    const period = `${query.from.split('-').reverse().join('-')},${query.to.split('-').reverse().join('-')}`;
    if (!u.search.slice(1).startsWith(period+',') && u.search.slice(1)!==period) throw new ConnectorError('admin_period_mismatch','O painel retornou uma oferta para outro período.');
    const amounts = [...htmlToText(cells[5]).matchAll(/([\d.]+,\d{2})\s*(Cart[aã]o|Pix|Entrada|Pagar)/gi)];
    const pix = amounts.filter(m=>/^pix$/i.test(m[2]));
    if (pix.length !== 1) throw new ConnectorError('admin_unrecognized', 'Preço Pix ambíguo na resposta autenticada.');
    const id = `imobsys-crcn-${identity[1]}-${identity[2]}`;
    if (offers.has(id)) throw new ConnectorError('admin_unrecognized', 'Oferta repetida na resposta autenticada.');
    offers.set(id, { id, base: identity[1], reference: identity[2], supplier: htmlToText(cells[0]), condominium: htmlToText(cells[1]), unit: htmlToText(cells[2]), description: htmlToText(cells[3]), capacityText: htmlToText(cells[4]), pixCents: moneyToCents(pix[0][1]), publicUrl: u.origin+u.pathname, status: 'offered-by-authenticated-search', reservationGuaranteed: false });
  }
  const restrictions = [...text.matchAll(/\b([a-z]{2,5}):\s*Min\s+de\s+(\d+)\s+Noites/gi)].map(m=>({supplier:m[1],type:'minimum-stay',minimumNights:Number(m[2])}));
  const empty = /Sem im[oó]veis na REDE|Nenhum registro encontrado|Nenhum im[oó]vel pr[oó]prio dispon[ií]vel/i.test(text);
  if (!offers.size && !restrictions.length && !empty) throw new ConnectorError('admin_unrecognized', 'Resposta autenticada não reconhecida; a sessão pode ter expirado.');
  return { ...query, observedAt:new Date().toISOString(), source:'authenticated-network-search', offers:[...offers.values()], count:offers.size, restrictions, status:offers.size?'offers-found':restrictions.length?'restricted':'not-observed', absenceMeans:'unknown', availabilityConfirmed:false, reservationGuaranteed:false, bookingEnabled:false, paymentEnabled:false };
}

export function createAdminProvider({fetchImpl=fetch, now=()=>Date.now()}={}) {
  let session=null, expiresAt=0, generation=0;
  return {
    configure(context) {
      const clean = {};
      for (const key of ['Base','User','UserId','Token','Ambiente']) {
        if (typeof context?.[key] !== 'string' || !context[key] || context[key].length>4096 || /[\r\n]/.test(context[key])) throw new ConnectorError('invalid_admin_context','Contexto de sessão incompleto.',400);
        if(/redacted|^\*+$/i.test(context[key]))throw new ConnectorError('protected_admin_context','O navegador protege este contexto. Use o executor do painel.',400);
        clean[key]=context[key];
      }
      session=clean; expiresAt=now()+30*60*1000; generation++;
    },
    status() { return {configured:!!session && expiresAt>now(),expiresAt:session?new Date(expiresAt).toISOString():null,generation,storage:'memory-only',operation:'hospedagem/getOrcamentoRede'}; },
    clear() { session=null;expiresAt=0;generation++; },
    async availability(input) {
      const {from,to}=validateDates(input.from,input.to);
      const unit=input.unit||'';
      if (!/^[A-Za-z0-9 -]{0,30}$/.test(unit)) throw new ConnectorError('invalid_unit','Unidade inválida.',400);
      const guests=String(input.guests||'');
      if (guests && !/^(?:[1-9]|10)$/.test(guests)) throw new ConnectorError('invalid_guests','Use 1 a 10 hóspedes ou todos.',400);
      if (!session || expiresAt<=now()) {session=null;throw new ConnectorError('admin_session_required','Reconecte a sessão administrativa para consultar a rede.',503);}
      const body=new URLSearchParams({...session,Ajax:'Ajax',Controller:'hospedagem',Action:'getOrcamentoRede',beforeSend:'nao',returnDiv:'#returnAjax_Lista'});
      const fields={selectCond:'',unidade:unit,entrada:from,saida:to,qtdeqrts:'all',minPax:'1',maxPax:'0',selectPax:guests||'all',crianca:'0',umCada:'0',qtdBusca:'',whatsapp:'',entradaAntecipada:'0',saidaProrrogada_0:'1',saidaProrrogada_1:'0',cFogao:'0',sFogao:'0',bebidas:'0',piscina24h:'0',barmolhado:'0',geladeira:'0',casal:'0',tela:'0',pet:'0',roupascama:'0',vistaPiscina:'0',frenteRua:'0',semServico:'0',banheiro:'all',estacionamento:'all',sofa:'all',ar:'all',tv:'all'};
      for(const [k,v] of Object.entries(fields))body.set(`dataPost[${k}]`,v);
      let response;
      try {response=await fetchImpl('https://app.reservascrcn.com.br/Ajax.php',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(30000)});} catch {throw new ConnectorError('admin_unavailable','Não foi possível consultar o painel.');}
      if(!response.ok || response.status>=300)throw new ConnectorError('admin_unavailable','O painel não aceitou a consulta.');
      const reader=response.body.getReader(); let size=0; const chunks=[];
      try { for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000)throw new ConnectorError('admin_response_too_large','Resposta acima do limite.');chunks.push(Buffer.from(value));} } finally {await reader.cancel().catch(()=>{});}
      return parseAdminAvailability(Buffer.concat(chunks).toString('utf8'),{from,to,unit,guests:guests||null});
    },
  };
}
