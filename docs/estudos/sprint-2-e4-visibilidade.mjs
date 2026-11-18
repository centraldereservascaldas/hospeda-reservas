// APIs e imagens simuladas; compara volume e gatilhos, sem criar reservas.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CRCN_PROJECT_ROOT || process.cwd();
const before = process.env.CRCN_BEFORE_BUILD;
const after = process.env.CRCN_AFTER_BUILD;
const output = process.env.CRCN_E4_OUTPUT || '/tmp/crcn-e4-visible';
if (!before || !after) throw new Error('Set CRCN_BEFORE_BUILD and CRCN_AFTER_BUILD.');
fs.mkdirSync(output, { recursive: true });
const template = JSON.parse(
  fs.readFileSync(path.join(root, 'resources/data/stays-apartments.json'), 'utf8'),
)[0];
const properties = Array.from({ length: 30 }, (_, i) => ({
  ...template,
  id: `test-${i}`,
  staysListingId: `unit-${i}`,
  title: `Apartamento teste ${i + 1}`,
  staysSynced: true,
  images: ['https://crcn.stays.net/image/6a356fe93db977efbea5a948'],
}));
let failNext = false;
const servers = [];
for (const [port, directory] of [
  [3187, before],
  [3188, after],
]) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const params = raw ? JSON.parse(raw) : {};
      let json = { success: true, data: [] };
      let status = 200;
      if (url.pathname === '/api/accommodations')
        json = { success: true, source: 'stays-live', data: properties };
      if (/^\/api\/accommodations\/[^/]+$/.test(url.pathname))
        json = {
          data: properties.find((p) => p.staysListingId === url.pathname.split('/').at(-1)) || null,
        };
      if (url.pathname === '/api/search') {
        if (port === 3188 && params.skip > 0 && failNext) {
          status = 503;
          failNext = false;
        }
        const nights = Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86400000);
        const data = properties
          .slice(params.skip, params.skip + params.limit)
          .map((p) => ({
            ...p,
            calculatedPrice: {
              nights,
              dailyRate: 250,
              basePrice: 250 * nights,
              cleaningFee: 0,
              serviceFee: 0,
              totalAmount: 250 * nights,
              currency: 'BRL',
            },
          }));
        json = {
          success: true,
          source: 'stays-live',
          from: params.from,
          to: params.to,
          guests: params.guests,
          total: data.length,
          data,
          pagination: {
            receivedCount: data.length,
            nextSkip: params.skip + data.length,
            hasMore: params.skip + data.length < properties.length,
          },
          unquotedCount: 0,
        };
      }
      setTimeout(() => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(json));
      }, 450);
      return;
    }
    const filename = path.join(directory, url.pathname === '/' ? 'index.html' : url.pathname);
    if (
      !filename.startsWith(directory + path.sep) ||
      !fs.existsSync(filename) ||
      !fs.statSync(filename).isFile()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const mime =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      }[path.extname(filename)] || 'application/octet-stream';
    let body = fs.readFileSync(filename);
    const headers = { 'Content-Type': mime };
    if (/javascript|html|css/.test(mime)) {
      body = zlib.gzipSync(body);
      headers['Content-Encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  servers.push(server);
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
const records = [];
try {
  for (const profile of [
    { name: 'before-mobile', port: 3187, width: 390 },
    { name: 'after-mobile', port: 3188, width: 390, actions: true },
    { name: 'before-desktop', port: 3187, width: 1280 },
    { name: 'after-desktop', port: 3188, width: 1280 },
    { name: 'after-fallback', port: 3188, width: 390, fallback: true, actions: true },
    { name: 'after-save-data', port: 3188, width: 1280, saver: true },
    { name: 'after-hidden', port: 3188, width: 1280, hidden: true },
  ]) {
    if (process.env.CRCN_PROFILE && profile.name !== process.env.CRCN_PROFILE) continue;
    const page = await browser.newPage({
      viewport: { width: profile.width, height: 844 },
      locale: 'pt-BR',
    });
    const requests = [];
    const errors = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/search') requests.push(r.postDataJSON());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://**/*', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/>',
      }),
    );
    await page.addInitScript(() => {
      window.__visibility = {};
      const Original = window.IntersectionObserver;
      window.IntersectionObserver = class extends Original {
        constructor(callback, options) {
          super((entries, observer) => {
            for (const entry of entries) {
              const key = entry.target.getAttribute('data-discovery-query');
              if (key)
                window.__visibility[key] = {
                  ratio: entry.intersectionRatio,
                  intersecting: entry.isIntersecting,
                };
            }
            callback(entries, observer);
          }, options);
        }
      };
    });
    if (profile.fallback)
      await page.addInitScript(() => {
        delete window.IntersectionObserver;
      });
    if (profile.saver)
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: Object.assign(new EventTarget(), { saveData: true }),
        }),
      );
    if (profile.hidden)
      await page.addInitScript(() => {
        window.__hidden = true;
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (window.__hidden ? 'hidden' : 'visible'),
        });
      });
    await page.goto(`http://127.0.0.1:${profile.port}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Recusar', exact: true }).click();
    await page.waitForTimeout(6000);
    const initial = requests.map((p) => ({ from: p.from, to: p.to, limit: p.limit, skip: p.skip }));
    if (profile.hidden) {
      assert.equal(initial.length, 0);
      await page.evaluate(() => {
        window.__hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(1200);
    }
    const beforeActions = requests.length;
    const initialVisibility = await page.evaluate(() => window.__visibility);
    let stages = [];
    if (profile.actions) {
      await page
        .locator('[data-discovery-query="pet-weekend-1"]')
        .evaluate((el) =>
          window.scrollTo(0, scrollY + el.getBoundingClientRect().bottom - innerHeight + 16),
        );
      await page.waitForTimeout(1200);
      stages.push({
        stage: 'first-visible-date',
        queries: requests.length,
        visibility: await page.evaluate(() => window.__visibility),
        geometry: await page.evaluate(() =>
          [...document.querySelectorAll('[data-discovery-query]')]
            .slice(0, 3)
            .map((el) => ({
              key: el.dataset.discoveryQuery,
              rect: el.getBoundingClientRect().toJSON(),
              width: getComputedStyle(el).width,
              rootFont: getComputedStyle(document.documentElement).fontSize,
            })),
        ),
      });
      const second = page.locator('[data-discovery-query="pet-weekend-2"]');
      await second.evaluate((el) => {
        const row = el.parentElement;
        row.scrollLeft = el.offsetLeft - row.firstElementChild.offsetLeft;
      });
      await page.waitForTimeout(1200);
      stages.push({ stage: 'horizontal-second-date', queries: requests.length });
      await second.evaluate((el) => {
        el.parentElement.scrollLeft = 0;
      });
      await page.waitForTimeout(700);
      stages.push({ stage: 'return-first-date', queries: requests.length });
      await page
        .locator('[data-discovery-query="caldas-country-1"]')
        .evaluate((el) =>
          window.scrollTo(0, scrollY + el.getBoundingClientRect().bottom - innerHeight + 16),
        );
      await page.waitForTimeout(1200);
      stages.push({ stage: 'next-collection', queries: requests.length });
      await page
        .locator('[data-discovery-query="catalog"]')
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(1200);
      stages.push({ stage: 'thematic-catalog', queries: requests.length });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const record = {
      profile: profile.name,
      initial,
      initialVisibility,
      queriesAfterResume: beforeActions,
      stages,
      finalRequests: requests,
      overflow,
      errors,
    };
    records.push(record);
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(records, null, 2));
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    if (profile.actions) {
      assert.ok(stages[0].queries >= 1 && stages[0].queries <= 2);
      assert.ok(stages[1].queries - stages[0].queries <= 1);
      assert.equal(stages[2].queries, stages[1].queries);
      assert.equal(stages[3].queries, stages[2].queries + 1);
      assert.equal(stages[4].queries, stages[3].queries + 2);
    }
    if (profile.name === 'after-mobile') assert.equal(initial.length, 0);
    if (profile.hidden) assert.ok(beforeActions > 0);
    if (profile.name.startsWith('after')) assert.ok(initial.every((p) => p.limit === 8));
    await page.close();
  }
} finally {
  await browser.close();
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
}
