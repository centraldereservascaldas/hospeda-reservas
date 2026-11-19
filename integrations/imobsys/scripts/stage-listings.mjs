import { readFile, writeFile, rename } from 'node:fs/promises';
import { stageListing } from '../src/staged-listing.mjs';
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
let media = new Map();
try { const snapshot = JSON.parse(await readFile(new URL('../data/media.json', import.meta.url), 'utf8')); media = new Map(snapshot.results.map(item => [item.propertyId, item])); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const output = { generatedAt: new Date().toISOString(), productionConnected: false, published: false, listings: catalog.properties.map(property => stageListing(property, media.get(property.id))) };
const temporary = new URL('../data/staged-listings.next.json', import.meta.url);
await writeFile(temporary, JSON.stringify(output, null, 2));
await rename(temporary, new URL('../data/staged-listings.json', import.meta.url));
console.log(`${output.listings.length} imóveis preparados localmente; nenhum publicado.`);
