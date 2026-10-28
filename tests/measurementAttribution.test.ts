import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://example.test/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
});

const { readMeasurementAttribution, updateMeasurementAttribution } =
  await import('../src/utils/measurementAttribution.ts');
const { saveMeasurementConsent } = await import('../src/utils/measurementConsent.ts');

const STORAGE_KEY = 'crcn.measurementAttribution.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

test('captures only the strict allowlist allowed by each consent category', () => {
  const search =
    '?utm_source=search&utm_medium=cpc&utm_campaign=summer_2026&utm_content=hero&utm_term=flats&gclid=G-123&gbraid=GB-123&wbraid=WB-123&fbclid=FB-123&email=guest%40example.test&custom=secret';
  const result = updateMeasurementAttribution(
    { analytics: true, advertising: false },
    search,
    1000,
  );

  assert.deepEqual(result?.firstTouch.values, {
    utm_source: 'search',
    utm_medium: 'cpc',
    utm_campaign: 'summer_2026',
    utm_content: 'hero',
    utm_term: 'flats',
  });
  assert.equal(JSON.stringify(result).includes('G-123'), false);
  assert.equal(JSON.stringify(result).includes('guest'), false);

  window.sessionStorage.clear();
  const advertisingOnly = updateMeasurementAttribution(
    { analytics: false, advertising: true },
    search,
    2000,
  );
  assert.deepEqual(advertisingOnly?.firstTouch.values, {
    gclid: 'G-123',
    gbraid: 'GB-123',
    wbraid: 'WB-123',
    fbclid: 'FB-123',
  });
});

test('rejects oversized, unsafe, repeated, and excessive URL values', () => {
  const result = updateMeasurementAttribution(
    { analytics: true, advertising: true },
    `?utm_source=${'a'.repeat(101)}&utm_medium=bad%40value&utm_campaign=valid&utm_content=one&utm_content=two&gclid=${'g'.repeat(101)}`,
    1000,
  );
  assert.deepEqual(result?.firstTouch.values, { utm_campaign: 'valid' });

  window.sessionStorage.clear();
  assert.equal(
    updateMeasurementAttribution(
      { analytics: true, advertising: true },
      `?utm_source=valid&padding=${'x'.repeat(4097)}`,
      2000,
    ),
    null,
  );

  window.sessionStorage.clear();
  const tooManyRecognizedPairs = updateMeasurementAttribution(
    { analytics: true, advertising: true },
    '?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=d&utm_term=e&gclid=f&gbraid=g&wbraid=h&fbclid=i&fbclid=j',
    3000,
  );
  assert.equal(tooManyRecognizedPairs, null);
});

test('expires the stored first and last touch after 30 days', () => {
  const now = 1_000_000;
  updateMeasurementAttribution({ analytics: true, advertising: true }, '?utm_source=campaign', now);

  assert.ok(
    readMeasurementAttribution({ analytics: true, advertising: true }, now + 30 * DAY_MS - 1),
  );
  assert.equal(
    readMeasurementAttribution({ analytics: true, advertising: true }, now + 30 * DAY_MS),
    null,
  );
  assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);
});

test('discards attribution with seconds, expired, or excessively future touch timestamps', () => {
  const now = 1_800_000_000_000;
  const invalidTimestamps = [
    Math.floor(now / 1000),
    now - 30 * DAY_MS,
    now + 5 * 60 * 1000 + 1,
  ];

  for (const capturedAt of invalidTimestamps) {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        expiresAt: now + 30 * DAY_MS,
        firstTouch: { capturedAt, values: { utm_source: 'google' } },
        lastTouch: { capturedAt: now, values: { utm_source: 'google' } },
      }),
    );

    assert.equal(readMeasurementAttribution({ analytics: true, advertising: true }, now), null);
    assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);
  }
});

test('accepts the exact future clock tolerance and clears a null stored attribution object', () => {
  const now = 1_800_000_000_000;
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      expiresAt: now + 30 * DAY_MS,
      firstTouch: { capturedAt: now, values: { utm_source: 'google' } },
      lastTouch: { capturedAt: now + 5 * 60 * 1000, values: { utm_source: 'google' } },
    }),
  );

  assert.ok(readMeasurementAttribution({ analytics: true, advertising: true }, now));

  window.sessionStorage.setItem(STORAGE_KEY, 'null');
  assert.equal(readMeasurementAttribution({ analytics: true, advertising: true }, now), null);
  assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);
});

test('does not collect without consent and removes a category when consent is revoked', () => {
  const now = Date.now();
  const search = '?utm_source=search&gclid=click';
  assert.equal(updateMeasurementAttribution(null, search, now), null);
  assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);

  window.history.replaceState({}, '', `/${search}`);
  saveMeasurementConsent({ analytics: true, advertising: true });
  assert.deepEqual(
    readMeasurementAttribution({ analytics: true, advertising: true }, now)?.lastTouch.values,
    { utm_source: 'search', gclid: 'click' },
  );

  saveMeasurementConsent({ analytics: false, advertising: true });
  const advertisingOnly = readMeasurementAttribution({ analytics: false, advertising: true }, now);
  assert.deepEqual(advertisingOnly?.firstTouch.values, { gclid: 'click' });
  assert.deepEqual(advertisingOnly?.lastTouch.values, { gclid: 'click' });

  saveMeasurementConsent({ analytics: false, advertising: false });
  assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);

  updateMeasurementAttribution({ analytics: true, advertising: true }, search, now);
  assert.equal(updateMeasurementAttribution(null, search, now + 1000), null);
  assert.equal(window.sessionStorage.getItem(STORAGE_KEY), null);
});

test('keeps first touch immutable when later campaigns include fields missing at first capture', () => {
  const consent = { analytics: true, advertising: true };
  updateMeasurementAttribution(consent, '?utm_source=first', 1000);
  const repeated = updateMeasurementAttribution(
    consent,
    '?utm_campaign=retargeting&gclid=click',
    2000,
  );

  assert.deepEqual(repeated?.firstTouch.values, {
    utm_source: 'first',
  });
  assert.deepEqual(repeated?.lastTouch.values, {
    utm_campaign: 'retargeting',
    gclid: 'click',
  });
  assert.equal(repeated?.firstTouch.capturedAt, 1000);
  assert.equal(repeated?.lastTouch.capturedAt, 2000);
});
