import { readFile, writeFile, rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createProvider, SITE_ORIGIN } from '../src/provider-http.mjs';
import { parsePropertyMedia } from '../src/property-media.mjs';
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url)));
try{const partner=JSON.parse(await readFile(new URL('../data/partner-catalog.json',import.meta.url)));const combined=new Map(catalog.properties.map(p=>[p.id,p]));for(const p of partner.properties)combined.set(p.id,p);catalog.properties=[...combined.values()];}catch(error){if(error.code!=='ENOENT')throw error;}
const provider = createProvider();
const records = new Map();
try { const old = JSON.parse(await readFile(new URL('../data/media.json', import.meta.url))); for (const r of old.results) records.set(r.propertyId, r); } catch {}
const save = async () => {
  const results = [...records.values()];
  await writeFile(new URL('../data/media.next.json', import.meta.url), JSON.stringify({ updatedAt: new Date().toISOString(), scope: 'observed-catalog-only', results }, null, 2));
  await rename(new URL('../data/media.next.json', import.meta.url), new URL('../data/media.json', import.meta.url));
};
let checked = 0, consecutiveErrors = 0;
for (const property of catalog.properties) {
  const old = records.get(property.id);
  if (old?.apartmentImages?.length && Date.now() - Date.parse(old.observedAt) < 86400000) continue;
  try {
    // Exact references already discovered; no ID enumeration or form submission.
    const html = await provider.readPublic(`${SITE_ORIGIN}/parceiro/${property.base}/${property.reference}`);
    records.set(property.id, parsePropertyMedia(html, property));
    consecutiveErrors = 0;
  } catch (e) {
    records.set(property.id, { propertyId: property.id, observedAt: new Date().toISOString(), error: e.code || 'consultation_failed', apartmentImages: [], condominiumImages: [] });
    consecutiveErrors++;
  }
  checked++;
  if (checked % 10 === 0) { await save(); console.log(`${records.size}/${catalog.properties.length} páginas; ${[...records.values()].reduce((n,r)=>n+r.apartmentImages.length,0)} fotos de unidades identificadas.`); }
  if (consecutiveErrors >= 5) { await save(); throw new Error('Cinco falhas consecutivas: coleta interrompida, progresso preservado.'); }
  await setTimeout(1000);
}
await save();
console.log(`Coleta concluída: ${records.size} referências; ${[...records.values()].filter(r=>r.apartmentImages.length).length} com fotos da unidade.`);
