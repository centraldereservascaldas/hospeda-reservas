import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePropertyMedia } from '../src/property-media.mjs';
const p = { id: 'imobsys-crcn-1-1149', base: '1', reference: '1149' };
const identity = '<input id="ImovRef" value="1149"><input id="BaseConsulta" value="1">';
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
