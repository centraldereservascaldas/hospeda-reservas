const $=id=>document.getElementById(id);
const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(cents/100);
const date=value=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
let state=null,visible=24,photoMap=new Map();
const element=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
async function read(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(70000)});const d=await r.json();if(!r.ok)throw new Error(d.message||'A consulta não foi concluída.');return d;}
function safeImages(offer){return (photoMap.get(offer.id)||[]).filter(i=>{try{const u=new URL(i.url);return i.kind==='apartment'&&u.origin==='https://reservascrcn.com.br'&&/^\/fotos\/[^/]+\/imoveis\/[^/]+\/fotos\//.test(u.pathname);}catch{return false;}}).map(i=>i.url).slice(0,12);}
function image(url,alt,lazy=true){const img=element('img');img.src=url;img.alt=alt;img.loading=lazy?'lazy':'eager';img.decoding='async';img.addEventListener('error',()=>{img.replaceWith(element('span','no-photo','Foto temporariamente indisponível'));},{once:true});return img;}
function openDetails(offer){$('gallery').replaceChildren(...offer.images.map(url=>image(url,`${offer.condominium} · unidade ${offer.unit}`,false)));$('detail-condo').textContent=offer.condominium;$('detail-title').textContent=`Apartamento ${offer.unit}`;$('detail-description').textContent=offer.description;$('detail-capacity').textContent=offer.capacityText;$('detail-price').textContent=money(offer.pixCents)+' no Pix';$('detail-dates').textContent=`${date(offer.from)} — ${date(offer.to)} · ${offer.nights} noites`;$('details').showModal();}
function render(){
 const term=$('filter').value.trim().toLocaleLowerCase('pt-BR');const offers=state.offers.filter(o=>`${o.condominium} ${o.unit} ${o.description}`.toLocaleLowerCase('pt-BR').includes(term));
 $('grid').replaceChildren(...offers.slice(0,visible).map(offer=>{
  const card=element('article','card'),photo=element('button','photo-button');photo.type='button';photo.setAttribute('aria-label',`Ver ${offer.condominium}, apartamento ${offer.unit}`);
  photo.append(offer.images.length?image(offer.images[0],`${offer.condominium}, unidade ${offer.unit}`):element('span','no-photo','Fotos em levantamento'));
  photo.append(element('span','photo-chip','Apartamento de parceiro'));photo.addEventListener('click',()=>openDetails(offer));
  const info=element('div','card-info');info.append(element('h3','',offer.condominium),element('p','unit',`Unidade ${offer.unit} · ${offer.capacityText.replace(/^Para até\s*/,'Até ')}`));
  const price=element('p','card-price');price.append(element('strong','',money(offer.pixCents)),element('span','',` / ${offer.nights} noites`));info.append(price,element('small','',`${date(offer.from)} — ${date(offer.to)} · Total no Pix`));
  const link=element('button','details-link','Ver apartamento');link.type='button';link.addEventListener('click',()=>openDetails(offer));info.append(document.createElement('br'),link);card.append(photo,info);return card;
 }));
 $('more').hidden=offers.length<=visible;
 $('status').textContent=offers.length?`${offers.length} apartamentos encontrados no painel para este período. Exibindo ${Math.min(visible,offers.length)}.`:state.selected.restrictions?.length?state.selected.restrictions.map(r=>`${r.supplier}: estadia mínima de ${r.minimumNights} noites`).join(' · '):'Nenhuma oferta encontrada nesta consulta. Isso não comprova que os apartamentos estejam ocupados.';
 $('period-label').textContent=`${date(state.selected.from)} — ${date(state.selected.to)} · ${state.selected.nights} noites`;
 $('freshness').textContent=state.selected.observedAt?`Última consulta: ${new Date(state.selected.observedAt).toLocaleString('pt-BR')}. A disponibilidade pode mudar.`:'';
}
function periods(){
 $('periods').replaceChildren(...state.periods.map(p=>{const b=element('button','period');b.type='button';b.setAttribute('aria-pressed',String(p.from===state.selected.from&&p.to===state.selected.to));b.append(element('strong','',p.label),element('span','',`${date(p.from)} — ${date(p.to)}`),element('small','',`${p.count} ofertas consultadas`));b.addEventListener('click',()=>load(p.from,p.to));return b;}));
}
async function load(from,to){try{$('status').textContent='Carregando os apartamentos para as datas selecionadas…';const q=from?`?${new URLSearchParams({from,to})}`:'';state=(await read('/api/preview'+q)).preview;$('from').value=state.selected.from;$('to').value=state.selected.to;$('guests').value='';visible=24;periods();render();history.replaceState(null,'',`/previa?${new URLSearchParams({from:state.selected.from,to:state.selected.to})}`);}catch(e){$('status').textContent=e.message;}}
$('filter').addEventListener('input',()=>{visible=24;if(state)render();});$('more').addEventListener('click',()=>{visible+=24;render();});$('close').addEventListener('click',()=>$('details').close());
async function runLiveSearch(){$('search-button').disabled=true;$('status').textContent='Conferindo ofertas e restrições no painel dos parceiros…';try{
 const query={from:$('from').value,to:$('to').value,guests:$('guests').value};const {result}=await read('/api/admin/availability?'+new URLSearchParams(query));const nights=(Date.parse(query.to)-Date.parse(query.from))/86400000;
 state={...state,selected:{...query,nights,observedAt:result.observedAt,restrictions:result.restrictions},offers:result.offers.map(o=>({...o,...query,nights,images:safeImages(o)}))};visible=24;periods();render();history.replaceState(null,'','/previa?'+new URLSearchParams(query));
 }catch(e){$('status').textContent=e.message+' Os resultados anteriores não correspondem à nova busca.';$('grid').replaceChildren();$('more').hidden=true;}finally{$('search-button').disabled=false;}}
$('search').addEventListener('submit',event=>{event.preventDefault();void runLiveSearch();});
void(async()=>{try{const {media}=await read('/api/media');photoMap=new Map(media.results.map(r=>[r.propertyId,r.apartmentImages]));const q=new URLSearchParams(location.search);const requested={from:q.get('from'),to:q.get('to'),guests:q.get('guests')};await load(requested.from,requested.to);if((!state&&requested.from&&requested.to)||requested.guests){if(!state)await load();if(requested.from)$('from').value=requested.from;if(requested.to)$('to').value=requested.to;$('guests').value=requested.guests||'';await runLiveSearch();}}catch(e){$('status').textContent=e.message;}})();
