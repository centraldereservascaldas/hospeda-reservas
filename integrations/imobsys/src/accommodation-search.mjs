import { ConnectorError, validateDates } from './provider-http.mjs';

// Compatible search envelope; unknown supplier details stay unknown.
export function mapAccommodationSearch(result, query) {
  const { from, to } = validateDates(query.from, query.to);
  const guests = Number(query.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 10) throw new ConnectorError('invalid_guests', 'Informe de 1 a 10 hóspedes.', 400);
  if (!result || result.source !== 'authenticated-network-search' || result.from !== from || result.to !== to || String(result.guests) !== String(guests) || !Array.isArray(result.offers)) throw new ConnectorError('search_mismatch', 'Resultado da consulta não corresponde ao período solicitado.', 502);
  const nights = (Date.parse(to) - Date.parse(from)) / 86400000;
  const data = result.offers.map(offer => {
    if (!/^imobsys-crcn-[1-9]\d*-[1-9]\d*$/.test(offer.id || '') || !Number.isSafeInteger(offer.pixCents) || offer.pixCents < 1) throw new ConnectorError('invalid_offer', 'Oferta inválida.', 502);
    return {
      id: offer.id, title: `${offer.condominium} – Apartamento ${offer.unit}`,
      subtitle: offer.condominium, description: offer.description || '',
      provider: 'imobsys', images: [], maxGuests: null,
      calculatedPrice: { nights, totalAmount: offer.pixCents / 100, currency: 'BRL', feesIncluded: true, dailyRate: null, cleaningFee: null, serviceFee: null },
      availabilityStatus: 'offered', reservationGuaranteed: false,
    };
  });
  return { success: true, source: 'imobsys-live', total: data.length, from, to, guests, data,
    unquotedCount: 0, meta: { observedAt: result.observedAt, availabilityConfirmed: false, bookingEnabled: false, paymentEnabled: false },
    pagination: { receivedCount: data.length, nextSkip: null, hasMore: false } };
}

/** Server-to-server contract: an observed offer is never a stock guarantee. */
export function mapPartnerOffers(result, query, {metadata={}, media=[]}={}) {
  const {from,to,nights}=validateDates(query.from,query.to);
  const guests=Number(query.guests),page=Number(query.page??1),pageSize=Number(query.pageSize??20);
  if(!Number.isInteger(guests)||guests<1||guests>10||!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new ConnectorError('invalid_query','Filtros ou paginação inválidos.',400);
  if(query.condominiumId && !/^[A-Za-z0-9_-]{1,80}$/.test(query.condominiumId))throw new ConnectorError('invalid_condominium','Condomínio inválido.',400);
  if(!result||result.source!=='authenticated-network-search'||result.from!==from||result.to!==to||String(result.guests)!==String(guests)||!Array.isArray(result.offers))throw new ConnectorError('search_mismatch','Resultado incompatível com a consulta.',502);
  const seen=new Set();
  const offers=result.offers.map(o=>{
    if(!/^imobsys-crcn-[1-9]\d*-[1-9]\d*$/.test(o.id||'')||o.id!==`imobsys-crcn-${o.base}-${o.reference}`||!Number.isSafeInteger(o.pixCents)||o.pixCents<1||seen.has(o.id))throw new ConnectorError('invalid_offer','Oferta inválida ou repetida.',502);
    seen.add(o.id);
    const info=metadata[o.id]||{};
    const item=media.find(m=>m.propertyId===o.id);
    const images=Array.isArray(item?.apartmentImages)?item.apartmentImages.filter(i=>{try{const u=new URL(i.url);return i.kind==='apartment'&&u.origin==='https://reservascrcn.com.br'&&/^\/fotos\/[^/]+\/imoveis\/[^/]+\/fotos\//.test(u.pathname);}catch{return false;}}).map(i=>i.url):[];
    const capacity=typeof o.capacityText==='string'?o.capacityText.match(/^Para\s+at[eé]\s+(\d+)\s+pessoas\b/i):null;
    return {id:o.id,provider:'imobsys',base:o.base??null,reference:o.reference??null,condominiumId:info.condominiumId??null,condominiumName:o.condominium||null,unit:o.unit||null,from,to,nights,guests,totalCents:o.pixCents,currency:'BRL',capacity:capacity?Number(capacity[1]):null,description:o.description||null,bedrooms:null,beds:null,bathrooms:null,amenities:null,location:null,images:images.length?images:null,active:info.active??null,siteAuthorized:info.siteAuthorized??null,status:'offer_observed',availabilityConfirmed:false,reservationGuaranteed:false};
  });
  if(query.condominiumId && !offers.some(o=>o.condominiumId===query.condominiumId) && offers.some(o=>o.condominiumId===null))throw new ConnectorError('condominium_mapping_unavailable','O vínculo de condomínios ainda não está confirmado.',503);
  if(query.condominiumId && !offers.length)throw new ConnectorError('condominium_mapping_unavailable','Não é possível confirmar o vínculo de condomínios sem ofertas.',503);
  const filtered=query.condominiumId?offers.filter(o=>o.condominiumId===query.condominiumId):offers;
  const start=(page-1)*pageSize;
  return {success:true,source:'imobsys-live',from,to,guests,observedAt:result.observedAt,offers:filtered.slice(start,start+pageSize),pagination:{page,pageSize,totalObserved:filtered.length,hasMore:start+pageSize<filtered.length},unmappedCondominiumCount:offers.filter(o=>o.condominiumId===null).length,catalogueComplete:false,absenceMeans:'unknown',bookingEnabled:false,paymentEnabled:false};
}
