import { readFile, writeFile, rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createProvider } from '../src/provider-http.mjs';
import { createCatalogProvider } from '../src/catalog-provider.mjs';

const snapshotPath = new URL('../data/catalog.json', import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const provider = createCatalogProvider(createProvider());
const properties = new Map(snapshot.properties.map(p => [p.id, p]));
const periods = [];
const now = new Date();
const dateAt = offset => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
// Bounded sequential public searches, never unit-ID enumeration or booking actions.
for (const [offset, nights] of [[1,1],[2,1],[3,1],[7,3],[14,3],[21,3],[45,3],[75,3],[110,3],[140,3],[170,3],[200,3]]) {
  const from = dateAt(offset), to = dateAt(offset + nights);
  try {
    const result = await provider.offers(from, to);
    periods.push({ from, to, observedAt: result.observedAt, success: true, offers: result.offers.map(o => ({ id: o.id, pixCents: o.pixCents })), paginationDetected: result.paginationDetected });
    for (const offer of result.offers) {
      const old = properties.get(offer.id);
      const { from, to, pixCents, supplierDateText, ...property } = offer;
      properties.set(offer.id, { ...property, firstObservedAt: old?.firstObservedAt || result.observedAt, lastObservedAt: result.observedAt, lastObservedOffer: { from, to, pixCents, supplierDateText, observedAt: result.observedAt } });
    }
    console.log(`${from}–${to}: ${result.count} ofertas; ${properties.size} referências acumuladas.`);
  } catch (e) { periods.push({ from, to, success: false, error: e.code || 'consultation_failed' }); console.log(`${from}: consulta não reconhecida; nenhum estado de ocupação inferido.`); }
  await setTimeout(1000);
}
if (!periods.some(p => p.success)) throw new Error('Nenhuma consulta válida; arquivos anteriores preservados.');
snapshot.properties = [...properties.values()].sort((a,b) => a.title.localeCompare(b.title, 'pt-BR'));
snapshot.scans.push(...periods.map(({ offers, ...p }) => ({ ...p, ...(offers ? { offers: offers.length } : {}) })));
snapshot.updatedAt = new Date().toISOString();
snapshot.catalogueComplete = false;
const coverage = { observedAt: snapshot.updatedAt, source: 'public-price-search', catalogueComplete: false, availabilityConfirmed: false, absenceMeaning: 'unknown-not-proof-of-unavailability', periods, units: snapshot.properties.map(p => ({ id: p.id, title: p.title, observations: periods.map(period => ({ from: period.from, to: period.to, status: !period.success ? 'query-failed' : period.offers.some(o => o.id === p.id) ? 'offered-by-supplier' : 'not-observed', availabilityConfirmed: false })) })) };
await writeFile(new URL('../data/coverage.next.json', import.meta.url), JSON.stringify(coverage, null, 2));
await rename(new URL('../data/coverage.next.json', import.meta.url), new URL('../data/coverage.json', import.meta.url));
await writeFile(new URL('../data/catalog.next.json', import.meta.url), JSON.stringify(snapshot, null, 2));
await rename(new URL('../data/catalog.next.json', import.meta.url), snapshotPath);
console.log(`Concluído: ${properties.size} referências. Disponibilidade final continua sem confirmação.`);
