import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorError, createProvider, htmlToText, parseAdvertisedQuote, validateDates, validateProperty } from '../src/provider-http.mjs';

const fixture = '<div>3 dias / 2 noites <b>R$ 465</b> / no PIX ou R$ 596 até 6x no cartão Entrada R$ 233 no pix para garantir o aluguel</div>';
const property = { id: 'imobsys-crcn-1-1149', base: '1', reference: '1149' };

test('extracts advertised amounts without adding our card fee or claiming availability', () => {
  assert.deepEqual(parseAdvertisedQuote(fixture, 2), { currency: 'BRL', pixCents: 46500, cardCents: 59600, depositCents: 23300, remainingPixCents: 23200, maxInstallments: 6 });
});

test('supports Brazilian thousands and cents', () => {
  const html = fixture.replace('R$ 465', 'R$ 1.465,50').replace('R$ 596', 'R$ 1.796,20');
  assert.equal(parseAdvertisedQuote(html, 2).pixCents, 146550);
});

test('rejects error HTML, multiple offers, malformed prices and mismatched nights', () => {
  for (const [html, nights] of [['Sem disponibilidade', 2], [fixture + fixture, 2], [fixture, 3], [fixture.replace('R$ 465', 'R$ 46,5'), 2], [fixture.replace('R$ 233', 'R$ 900'), 2]]) {
    assert.throws(() => parseAdvertisedQuote(html, nights), ConnectorError);
  }
});

test('never extracts script content as a price', () => {
  assert.equal(htmlToText('<script>R$ 1</script><p>Oferta&nbsp;visível</p>'), 'Oferta visível');
});

test('validates dates and property identities before contacting the supplier', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  assert.equal(validateDates('2026-11-27', '2026-11-29', now).nights, 2);
  for (const [from, to] of [['2026-11-17', '2026-11-29'], ['2026-11-29', '2026-11-27'], ['2026-11-31', '2026-12-02'], ['2026-11-27', '2027-03-01']]) {
    assert.throws(() => validateDates(from, to, now), ConnectorError);
  }
  assert.throws(() => validateProperty({ base: '../1', reference: '1149' }), ConnectorError);
});

test('quote can call only the public price consultation and never transmits the CNSP secret', async () => {
  const calls = [];
  const provider = createProvider({ authorization: 'Basic secret-test', fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(fixture); } });
  const from = new Date(); from.setUTCDate(from.getUTCDate() + 10);
  const to = new Date(from); to.setUTCDate(to.getUTCDate() + 2);
  const quote = await provider.quote(property, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://reservascrcn.com.br/');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.body.get('action'), 'buscaPrecos');
  assert.equal(calls[0].options.body.has('ALUGAR'), false);
  assert.equal(calls[0].options.body.has('ID_ORCA'), false);
  assert.equal(quote.availability, 'not-confirmed');
  assert.equal(quote.bookingEnabled, false);
  assert.equal(quote.paymentEnabled, false);
  assert.equal(quote.guestCountVerified, false);
});

test('does not follow a supplier redirect or return upstream error details', async () => {
  const provider = createProvider({ fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'https://untrusted.example/' } }) });
  await assert.rejects(provider.property(property), { code: 'upstream_http_error' });
  const failing = createProvider({ fetchImpl: async () => { throw new Error('secret-test upstream details'); } });
  await assert.rejects(failing.property(property), (error) => error.code === 'upstream_unavailable' && !error.message.includes('secret-test'));
});

test('diagnoses credentials only at the exact CNSP host without claiming mapped API actions', async () => {
  const calls = [];
  const provider = createProvider({ authorization: 'Basic secret-test', fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ error: true, message: 'Action não informada' }); } });
  assert.deepEqual(await provider.status(), { configured: true, authenticated: true, actionsMapped: false });
  assert.equal(calls[0].url, 'https://api.cnsp.app/crcn');
  assert.equal(calls[0].options.headers.Authorization, 'Basic secret-test');
  assert.deepEqual(await createProvider().status(), { configured: false, authenticated: null, actionsMapped: false });
});

test('does not accept excessive upstream responses', async () => {
  const provider = createProvider({ fetchImpl: async () => new Response('x'.repeat(1500001)) });
  await assert.rejects(provider.property(property), { code: 'upstream_too_large' });
});
