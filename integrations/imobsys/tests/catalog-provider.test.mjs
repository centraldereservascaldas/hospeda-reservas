import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorError, createProvider } from '../src/provider-http.mjs';
import { createCatalogProvider, parseCondominiums, parseOffers, parseOccupancyMap } from '../src/catalog-provider.mjs';

const offerRow = `<tr class="custonFilter fogao geladeira"><td><b>FLAT EXPRESS | 00109</b><div>Quarto e copa</div><i>Permitido 4 pessoas + 1 criança até 5 anos</i></td><td>27/11/2026 as 14h 29/11/2026 Até 18H</td><td>R$ <b>465</b> no PIX <i>P/ alugar R$ 500.000</i></td><td><a href="https://reservascrcn.com.br/parceiro/1/1149?27-11-2026,29-11-2026?s1,,">Ver</a></td></tr>`;

test('extracts only same-origin condominium routes from the sitemap', () => {
  const xml = '<urlset><url><loc>https://reservascrcn.com.br/condominio/90</loc><image:title>Flat Express</image:title><image:loc>https://reservascrcn.com.br/fotos/a.jpg</image:loc></url><url><loc>https://other.example/condominio/1</loc></url><url><loc>https://reservascrcn.com.br/login/</loc></url></urlset>';
  const items = parseCondominiums(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, '90');
  assert.equal(items[0].title, 'Flat Express');
});

test('extracts references and advertised prices without treating vendor cost as a customer price', () => {
  const result = parseOffers(`<table>${offerRow}</table>`, '2026-11-27', '2026-11-29');
  assert.equal(result.count, 1);
  assert.equal(result.offers[0].id, 'imobsys-crcn-1-1149');
  assert.equal(result.offers[0].pixCents, 46500);
  assert.equal(result.offers[0].publicUrl, 'https://reservascrcn.com.br/parceiro/1/1149');
  assert.equal(result.offers[0].availabilityConfirmed, false);
  assert.deepEqual(result.offers[0].features, ['fogao', 'geladeira']);
  assert.equal(result.offers[0].advertisedCapacity, 4);
});

test('fails closed on duplicate, mismatched or unrecognized offers', () => {
  assert.throws(() => parseOffers(offerRow + offerRow, '2026-11-27', '2026-11-29'), { code: 'offers_duplicated' });
  assert.throws(() => parseOffers(offerRow, '2026-12-01', '2026-12-03'), { code: 'offers_unrecognized' });
  assert.throws(() => parseOffers('<p>Erro inesperado</p>', '2026-11-27', '2026-11-29'), ConnectorError);
});

test('does not equate an explicit empty result with confirmed unavailability', () => {
  const result = parseOffers('Nenhum apartamento encontrado para o período.', '2026-11-27', '2026-11-29');
  assert.equal(result.count, 0);
  assert.equal(result.explicitlyEmpty, true);
});

test('calendar marks are observations, never confirmed availability', () => {
  const month = new Date().toISOString().slice(0, 7);
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = Array.from({ length: days }, (_, i) => `<td style="${i === 0 ? 'background: #035bc9' : i === 1 ? 'background: linear-gradient(red, white)' : ''}" class="col-day">&nbsp;</td>`).join('');
  const result = parseOccupancyMap(`<table><tr><td>Flat</td><td><a href="/imovel/90-00109">00109</a></td>${cells}</tr></table>`, month);
  assert.equal(result.count, 1);
  assert.equal(result.units[0].dates[0].observation, 'colored-marker');
  assert.equal(result.units[0].dates[1].observation, 'partial-marker');
  assert.equal(result.units[0].dates[2].observation, 'unmarked');
  assert.ok(result.units[0].dates.every((date) => date.availability === 'unknown'));
  assert.equal(result.legendVerified, false);
});

test('calendar empty response is unknown, not an empty inventory', () => {
  assert.throws(() => parseOccupancyMap('<table><tr><td>01</td></tr></table>', new Date().toISOString().slice(0, 7)), { code: 'calendar_unrecognized' });
});

test('search uses only the observed read-only price action without credentials or booking flags', async () => {
  let called;
  const from = new Date(); from.setUTCDate(from.getUTCDate() + 10);
  const to = new Date(from); to.setUTCDate(to.getUTCDate() + 2);
  const a = from.toISOString().slice(0, 10), b = to.toISOString().slice(0, 10);
  const format = (date) => date.split('-').reverse().join('/');
  const fixture = offerRow.replaceAll('27/11/2026', '__FROM__').replaceAll('29/11/2026', '__TO__').replaceAll('__FROM__', format(a)).replaceAll('__TO__', format(b));
  const provider = createCatalogProvider(createProvider({ authorization: 'Basic secret-test', fetchImpl: async (url, options) => { called = { url, options }; return new Response(fixture); } }));
  const result = await provider.offers(a, b);
  assert.equal(called.options.body.get('action'), 'listaprecos');
  assert.equal(called.options.body.has('ALUGAR'), false);
  assert.equal(called.options.body.has('ID_ORCA'), false);
  assert.equal(called.options.headers.Authorization, undefined);
  assert.equal(result.catalogueComplete, false);
});

test('HTTP 200 with a fatal application error is rejected', async () => {
  const provider = createProvider({ fetchImpl: async () => new Response('<b>Fatal error</b>: Uncaught TypeError: unexpected supplier data') });
  await assert.rejects(provider.readPublic('https://reservascrcn.com.br/'), { code: 'upstream_application_error' });
});
