import {stageListing} from './staged-listing.mjs';
import {validateProperty} from './provider-http.mjs';

export function buildIntegrationBundle({catalog,partner,curated,rolling,media,now=new Date()}) {
 const properties=new Map((catalog.properties||[]).map(p=>[p.id,{...p}]));
 for(const p of partner.properties||[])properties.set(p.id,{...properties.get(p.id),...p});
 const observations=new Map();
 for(const dataset of [curated,rolling])for(const period of dataset.periods||[])for(const offer of period.offers||[]){
  const query={from:period.from,to:period.to,guests:period.guests||null,unit:period.unit||''};
  const key=JSON.stringify(query),item={...query,pixCents:offer.pixCents,currency:'BRL',observedAt:period.observedAt,source:period.source||dataset.source,status:'offered-by-authenticated-search',availabilityConfirmed:false,feeBreakdownVerified:false};
  if(!Number.isSafeInteger(item.pixCents)||item.pixCents<=0)throw new Error('Invalid integration price');
  const byQuery=observations.get(offer.id)||new Map();const old=byQuery.get(key);
  if(!old||Date.parse(item.observedAt)>Date.parse(old.observedAt))byQuery.set(key,item);
  observations.set(offer.id,byQuery);
  properties.set(offer.id,{...properties.get(offer.id),...offer,title:`${offer.condominium} | ${offer.unit}`});
 }
 const mediaById=new Map((media.results||[]).map(m=>[m.propertyId,m]));
 const listings=[...properties.values()].map(property=>{
  validateProperty(property);
  if(property.id!==`imobsys-crcn-${property.base}-${property.reference}`)throw new Error('Supplier identity mismatch');
  const staged=stageListing(property,mediaById.get(property.id));
  const capacity=property.capacityText?.match(/Para\s+at[eé]\s+(\d+)\s+Pessoas/i);
  const bedrooms=property.description?.match(/\b(\d+)\s+quartos?\b/i);
  const tags=[...new Set([...property.description?.matchAll(/#([\p{L}\d/_-]+)/gu)||[]].map(m=>m[1]))];
  const quotes=[...(observations.get(property.id)?.values()||[])].sort((a,b)=>a.from.localeCompare(b.from));
  const latest=[...quotes].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]||null;
  const queryObservations=(rolling.periods||[]).map(period=>({from:period.from,to:period.to,guests:period.guests||null,observedAt:period.observedAt,status:period.offers.some(o=>o.id===property.id)?'offered-by-authenticated-search':'not-observed',absenceMeans:'unknown',inventoryHeld:false}));
  const condoMedia=(mediaById.get(property.id)?.condominiumImages||[]).filter(i=>{try{return new URL(i.url).origin==='https://reservascrcn.com.br'&&i.kind==='condominium';}catch{return false;}});
  return {...staged,
   siteCandidate:{id:property.id,title:property.title,subtitle:`Unidade ${property.unit||'não informada'}`,description:property.description||null,complexName:property.condominium||null,images:staged.images.map(i=>i.url),complexImages:condoMedia.map(i=>i.url),maxGuests:capacity?Number(capacity[1]):property.advertisedCapacity||null,bedrooms:bedrooms?Number(bedrooms[1]):null,amenities:tags.map(tag=>({tag,evidence:'supplier-description',verified:false})),location:null,host:null,rating:null,reviewCount:null,pricePerNight:null,cleaningFee:null},
   price:null,datedQuotes:quotes,queryObservations,
   availability:{status:'query-required',latestObservation:latest,absenceMeans:'unknown',requiresRecheck:true,inventoryHeld:false},
   publication:{enabled:false,automaticEligibility:false,scope:property.base==='1'||property.base==='31'?'supplier-public-network':'internal-network-review-required'},
   compatibility:{currentClientAcceptsProvider:false,requiredChanges:['explicit-provider-discriminator','provider-aware-cache-and-routing','nullable-unknown-fields','dated-total-price-in-cents','provider-specific-reservation-lifecycle']},
   missingForPublication:[...new Set([...staged.missingForPublication,'resale-permission-and-commercial-rules','location-and-property-details'])],
  };
 }).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
 const successfulScans=rolling.scans?.filter(s=>s.success).length||0;
 return {schemaVersion:'imobsys-integration-candidate/v1',generatedAt:now.toISOString(),productionConnected:false,bookingEnabled:false,paymentEnabled:false,published:false,
  coverage:{references:listings.length,withUnitPhotos:listings.filter(l=>l.images.length).length,curatedPeriods:curated.periods?.length||0,rollingQueriesSucceeded:successfulScans,rollingQueriesFailed:rolling.scans?.filter(s=>!s.success).length||0,catalogueComplete:false,dailyOccupancyConfirmed:false},
  provider:{id:'imobsys-crcn',identityParts:['account','base','reference'],currentClientAllowedSources:['stays-live','stays-simulated'],newSourceProposed:'imobsys-live'},listings};
}
