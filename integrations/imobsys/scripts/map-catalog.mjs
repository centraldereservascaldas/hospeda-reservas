import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { createProvider } from '../src/provider-http.mjs';
import { createCatalogProvider } from '../src/catalog-provider.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const provider = createCatalogProvider(createProvider());
const now = new Date();
const dateAt = (offset) => { const date = new Date(now); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const periods = [5, 9, 16, 30, 58, 86].map((offset) => ({ from: dateAt(offset), to: dateAt(offset + 2) }));
const units = new Map();
let previous;
try { previous = JSON.parse(await readFile(`${root}/data/catalog.json`, 'utf8')); } catch {}
for (const property of previous?.properties || []) units.set(property.id, property);
const condominiums = await provider.condominiums();
const scans = [];
for (const period of periods) {
  try {
    const result = await provider.offers(period.from, period.to);
    scans.push({ ...period, success: true, offers: result.count, paginationDetected: result.paginationDetected });
    for (const offer of result.offers) {
      const old = units.get(offer.id);
      const { from, to, pixCents, supplierDateText, ...property } = offer;
      units.set(offer.id, { ...property, firstObservedAt: old?.firstObservedAt || result.observedAt, lastObservedAt: result.observedAt, lastObservedOffer: { from, to, pixCents, supplierDateText, observedAt: result.observedAt } });
    }
    console.log(`${period.from} a ${period.to}: ${result.count} ofertas; ${units.size} referências acumuladas.`);
  } catch (error) {
    scans.push({ ...period, success: false, error: error.code || 'consultation_failed' });
    console.log(`${period.from} a ${period.to}: consulta não reconhecida; inventário anterior preservado.`);
  }
  await setTimeout(700);
}
if (!scans.some((scan) => scan.success)) throw new Error('Nenhuma consulta válida. Snapshot anterior preservado.');
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(now);
let calendar;
try { calendar = await provider.calendar(month); } catch (error) { calendar = { error: error.code || 'calendar_failed', availabilityConfirmed: false }; }
const snapshot = { updatedAt: new Date().toISOString(), source: 'imobsys-public-website', catalogueComplete: false, coverage: 'union-of-observed-offers', note: 'O sitemap lista condomínios. As unidades são descobertas por ofertas em períodos consultados, sem garantia de inventário exaustivo.', condominiums, scans, properties: [...units.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), calendar };
await mkdir(`${root}/data`, { recursive: true });
await writeFile(`${root}/data/catalog.next.json`, JSON.stringify(snapshot, null, 2) + '\n');
await rename(`${root}/data/catalog.next.json`, `${root}/data/catalog.json`);
console.log(`Snapshot local: ${condominiums.length} condomínios, ${units.size} referências. Completude e disponibilidade final não confirmadas.`);
