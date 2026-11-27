import { readFile, writeFile } from 'node:fs/promises';
import { createProvider, SITE_ORIGIN } from '../src/provider-http.mjs';
import { parsePropertyMedia } from '../src/property-media.mjs';
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url)));
const provider = createProvider();
const samples = [catalog.properties.find(p => p.id === 'imobsys-crcn-1-1149'), catalog.properties.find(p => p.base === '31')].filter(Boolean);
const results = [];
for (const property of samples) {
  const html = await provider.readPublic(`${SITE_ORIGIN}/parceiro/${property.base}/${property.reference}`);
  const media = parsePropertyMedia(html, property);
  results.push(media);
  console.log(`${property.id}: ${media.apartmentImages.length} fotos da unidade; ${media.condominiumImages.length} fotos de áreas comuns.`);
}
await writeFile(new URL('../data/media-samples.json', import.meta.url), JSON.stringify({ results }, null, 2));
