import assert from 'node:assert/strict';
import test from 'node:test';
import { getPropertyMapLinks } from '../src/utils/propertyLocation.ts';

test('builds embedded and external map URLs for valid property coordinates', () => {
  const links = getPropertyMapLinks(-17.7512, -48.631);

  assert.ok(links);
  const embedUrl = new URL(links.embedUrl);
  const externalUrl = new URL(links.externalUrl);
  assert.equal(embedUrl.hostname, 'www.openstreetmap.org');
  assert.equal(embedUrl.searchParams.get('marker'), '-17.7512,-48.631');
  assert.equal(externalUrl.hostname, 'www.google.com');
  assert.equal(externalUrl.searchParams.get('query'), '-17.7512,-48.631');
});

test('does not create map links for missing, non-finite, or placeholder coordinates', () => {
  assert.equal(getPropertyMapLinks(0, 0), null);
  assert.equal(getPropertyMapLinks(Number.NaN, -48.631), null);
  assert.equal(getPropertyMapLinks(-17.7512, Number.POSITIVE_INFINITY), null);
  assert.equal(getPropertyMapLinks(-0.01, -48.631), null);
});
