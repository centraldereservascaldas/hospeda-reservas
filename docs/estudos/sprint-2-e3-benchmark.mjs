// Busca controlada: dados e imagens simulados; nenhum acesso ao provedor ou compra.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CRCN_PROJECT_ROOT || process.cwd();
const before = process.env.CRCN_BEFORE_BUILD;
const after = process.env.CRCN_AFTER_BUILD;
const output = process.env.CRCN_E3_OUTPUT || '/tmp/crcn-e3';
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
  [3185, before],
  [3186, after],
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
        if (port === 3186 && params.skip > 0 && failNext) {
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
const results = process.env.CRCN_SKIP_AB
  ? JSON.parse(fs.readFileSync(path.join(output, 'ab.json'), 'utf8'))
  : [];
try {
  for (const profile of process.env.CRCN_SKIP_AB
    ? []
    : [
        { name: 'mobile', width: 390, height: 844, cpu: 4, dpr: 2 },
        { name: 'desktop', width: 1280, height: 900, cpu: 1, dpr: 1 },
      ]) {
    for (let repetition = 1; repetition <= 3; repetition++)
      for (const [variant, port] of [
        ['before', 3185],
        ['after', 3186],
      ]) {
        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height },
          deviceScaleFactor: profile.dpr,
          locale: 'pt-BR',
        });
        const page = await context.newPage();
        const errors = [];
        const requests = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('request', (r) => {
          if (r.url().endsWith('/api/search')) requests.push(r.postDataJSON());
        });
        await page.route('https://crcn.stays.net/**', (route) =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#eee"/></svg>',
          }),
        );
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 150,
          downloadThroughput: 500000,
          uploadThroughput: 125000,
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        await page.addInitScript(() => {
          window.__firstCard = null;
          new MutationObserver(() => {
            if (
              window.__firstCard === null &&
              document.querySelector('#stays-apartments-catalog article')
            )
              window.__firstCard = performance.now();
          }).observe(document, { subtree: true, childList: true });
        });
        await page.goto(`http://127.0.0.1:${port}/?from=2027-05-01&to=2027-05-04&adults=2`, {
          waitUntil: 'domcontentloaded',
        });
        await page.locator('#stays-apartments-catalog article').first().waitFor();
        await page.waitForTimeout(1000);
        const row = {
          profile: profile.name,
          variant,
          repetition,
          requests: requests.map((p) => ({ limit: p.limit, skip: p.skip })),
          ...(await page.evaluate(() => ({
            firstCardMs: window.__firstCard,
            cards: document.querySelectorAll('#stays-apartments-catalog article').length,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }))),
          errors,
        };
        assert.equal(row.cards, variant === 'before' ? 30 : 12);
        assert.equal(row.requests.length, variant === 'before' ? 2 : 1);
        assert.equal(row.overflow, false);
        assert.equal(errors.length, 0);
        results.push(row);
        fs.writeFileSync(path.join(output, 'ab.json'), JSON.stringify(results, null, 2));
        await context.close();
      }
  }
  const functional = [];
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let searchRequests = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/search')) searchRequests++;
    });
    await page.route('https://crcn.stays.net/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/>',
      }),
    );
    await page.goto('http://127.0.0.1:3186/?from=2027-05-01&to=2027-05-04&adults=2');
    await page.getByRole('button', { name: 'Recusar', exact: true }).click();
    const cards = page.locator('#stays-apartments-catalog article');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 12);
    failNext = true;
    await page
      .getByRole('button', { name: 'Carregar mais', exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
    await page.getByRole('button', { name: 'Tentar carregar mais' }).waitFor();
    assert.equal(await cards.count(), 12);
    await page.getByRole('button', { name: 'Tentar carregar mais' }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('#stays-apartments-catalog article').length === 24,
    );
    await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
    await page.getByRole('button', { name: 'Fim dos resultados' }).waitFor();
    assert.equal(await cards.count(), 30);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    let detailReturn = null;
    if (width === 390) {
      const trigger = page.locator('[data-property-detail-trigger]').nth(25);
      await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const scrollBefore = await page.evaluate(() => scrollY);
      await trigger.click();
      await page.waitForURL(/\/apartamento\//);
      await page.goBack();
      await page.waitForFunction(
        () => document.querySelectorAll('#stays-apartments-catalog article').length === 30,
      );
      await page.waitForTimeout(600);
      const scrollAfter = await page.evaluate(() => scrollY);
      fs.writeFileSync(
        path.join(output, 'detail-return.json'),
        JSON.stringify(
          {
            searchRequests,
            scrollBefore,
            scrollAfter,
            history: await page.evaluate(() => history.state),
          },
          null,
          2,
        ),
      );
      const savedScroll = await page.evaluate(() => history.state.__crcnPropertyDetailReturnScroll);
      assert.equal(searchRequests, 4);
      assert.ok(Math.abs(scrollAfter - savedScroll) < 3);
      detailReturn = {
        cards: await cards.count(),
        searchRequests,
        scrollBefore,
        savedScroll,
        scrollAfter,
        focusedProperty: await page.evaluate(
          () => document.activeElement?.dataset?.propertyDetailTrigger,
        ),
      };
      assert.equal(detailReturn.focusedProperty, 'test-25');
    }
    functional.push({
      detailReturn,
      width,
      firstPage: 12,
      preservedAfterFailure: 12,
      afterRetry: 24,
      final: 30,
      overflow,
    });
    fs.writeFileSync(path.join(output, 'functional.json'), JSON.stringify(functional, null, 2));
    await page.close();
  }
  fs.writeFileSync(
    path.join(output, 'browser.json'),
    JSON.stringify({ results, functional }, null, 2),
  );
} finally {
  await browser.close();
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
}
