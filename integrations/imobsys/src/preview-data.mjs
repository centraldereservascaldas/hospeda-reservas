import {ConnectorError,validateDates} from './provider-http.mjs';
export function makePreview(snapshot,media,query={}) {
 const periods=snapshot.periods||[];
 const from=query.from||periods[0]?.from,to=query.to||periods[0]?.to;
 validateDates(from,to);
 const selected=periods.find(p=>p.from===from&&p.to===to);
 if(!selected)throw new ConnectorError('period_not_mapped','Este período ainda não foi consultado no painel.',404);
 const photos=new Map((media.results||[]).map(m=>[m.propertyId,m.apartmentImages||[]]));
 const nights=(Date.parse(to)-Date.parse(from))/86400000;
 const offers=selected.offers.map(o=>{
  if(!Number.isSafeInteger(o.pixCents)||o.pixCents<=0)throw new ConnectorError('invalid_preview_price','Preço inválido na prévia.');
  const images=(photos.get(o.id)||[]).filter(i=>{try{const u=new URL(i.url);return i.kind==='apartment'&&u.origin==='https://reservascrcn.com.br'&&/^\/fotos\/[^/]+\/imoveis\/[^/]+\/fotos\//.test(u.pathname);}catch{return false;}}).slice(0,12).map(i=>i.url);
  return {...o,images,from,to,nights,observedAt:selected.observedAt,paymentEnabled:false,bookingEnabled:false};
 });
 return {updatedAt:snapshot.updatedAt,periods:periods.map(p=>({from:p.from,to:p.to,label:p.label,count:p.count,status:p.status})),selected:{from,to,label:selected.label,nights,observedAt:selected.observedAt,restrictions:selected.restrictions},offers,count:offers.length,catalogueComplete:false,availabilityConfirmed:false,bookingEnabled:false,paymentEnabled:false};
}
