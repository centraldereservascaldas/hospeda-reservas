import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPropertyMedia, parsePropertyMedia } from '../src/property-media.mjs';
const p = { id: 'imobsys-crcn-1-1149', base: '1', reference: '1149' };
const identity = '<input id="ImovRef" value="1149"><input id="BaseConsulta" value="1">';
test('extracts the identified apartment description without scripts or surrounding content', () => {
  const html = identity + '<div class="pi-margin-top-15">Condições gerais do condomínio</div><div class="pi-margin-top-15"><b>COMODIDADES DO APARTAMENTO:</b><br>QUARTO: cama de casal<br><script>unsafe()</script>Não inclui roupa de cama</div><p>Outro imóvel</p>';
  const result = parsePropertyMedia(html, p);
  assert.match(result.description, /QUARTO: cama de casal/);
  assert.match(result.description, /Não inclui roupa de cama/);
  assert.doesNotMatch(result.description, /unsafe|Outro imóvel|Condições gerais/);
});
test('separates apartment photos from common areas, excludes logos and external URLs', () => {
  const m = parsePropertyMedia(identity + '<img src="/fotos/cr/imoveis/090-00109/fotos/a.JPG"><img src="/fotos/cr/imoveis/090-00109/fotos/a.JPG"><img src="/fotos/crcn/condominios/090/fotos/b.jpeg"><img src="/fotos/crcn/img/logo.png"><img src="https://evil.test/fotos/cr/imoveis/090-00109/fotos/a.JPG">', p);
  assert.equal(m.apartmentImages.length, 1);
  assert.equal(m.condominiumImages.length, 1);
  assert.equal(m.calendarIdentity, null);
  assert.equal(m.availabilityConfirmed, false);
});
test('rejects photos associated with a mismatched supplier identity', () => {
  assert.throws(() => parsePropertyMedia(identity, { ...p, reference: '9' }));
});
test('ignores inactive markup in scripts and comments', () => {
  const fake = '<img src="/fotos/cr/imoveis/other/fotos/injected.JPG">';
  const media = parsePropertyMedia(identity + `<script>${fake}</script><!--${fake}-->`, p);
  assert.equal(media.apartmentImages.length, 0);
});

test('fetches one observed property page and returns its identity-checked apartment photos', async () => {
  const requests = [];
  const media = await fetchPropertyMedia({
    readPublic: async (url) => {
      requests.push(url);

      return `${identity}<img src="/fotos/a/imoveis/090-00109/fotos/unit.jpg"><img src="/fotos/a/condominios/090/fotos/pool.jpg">`;
    },
  }, p.id);

  assert.deepEqual(requests, ['https://reservascrcn.com.br/parceiro/1/1149']);
  assert.equal(media.apartmentImages.length, 1);
  assert.equal(media.condominiumImages.length, 1);
  assert.equal(media.apartmentImages[0].url, 'https://reservascrcn.com.br/fotos/a/imoveis/090-00109/fotos/unit.jpg');
});

test('rejects untrusted property identifiers before requesting a page', async () => {
  let requests = 0;
  await assert.rejects(
    fetchPropertyMedia({ readPublic: async () => { requests++; return identity; } }, 'imobsys-crcn-2-663/../../login'),
    { code: 'invalid_property' },
  );
  assert.equal(requests, 0);
});
