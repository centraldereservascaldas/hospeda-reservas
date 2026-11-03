// Comparação controlada: APIs locais simuladas; somente a capa pública vem da Stays.
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
const root = process.env.CRCN_PROJECT_ROOT;
const before = process.env.CRCN_BEFORE_BUILD;
const after = process.env.CRCN_AFTER_BUILD;
const output = process.env.CRCN_E2_OUTPUT || '/tmp/crcn-e2';
if (!root || !before || !after)
  throw new Error('Set CRCN_PROJECT_ROOT, CRCN_BEFORE_BUILD and CRCN_AFTER_BUILD.');
fs.mkdirSync(output, { recursive: true });
const source = JSON.parse(fs.readFileSync(`${root}/resources/data/stays-apartments.json`, 'utf8'))
  .slice(0, 2)
  .map((p) => ({
    ...p,
    staysSynced: true,
    images: ['https://crcn.stays.net/image/6a356fe93db977efbea5a948'],
    calculatedPrice: undefined,
  }));
const servers = [];
for (const [variant, dir, port] of [
  ['before', before, 3183],
  ['after', after, 3184],
]) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    if (u.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const part of req) raw += part;
      const p = raw ? JSON.parse(raw) : {};
      let json = { success: true, data: [] };
      if (u.pathname === '/api/accommodations')
        json = { success: true, source: 'stays-live', data: source };
      if (u.pathname === '/api/search') {
        const nights =
          p.from && p.to ? Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86400000) : null;
        const data = p.skip
          ? []
          : source.map((item) => ({
              ...item,
              ...(nights
                ? {
                    calculatedPrice: {
                      nights,
                      dailyRate: 250,
                      basePrice: 250 * nights,
                      cleaningFee: 0,
                      serviceFee: 0,
                      totalAmount: 250 * nights,
                      currency: 'BRL',
                    },
                  }
                : {}),
            }));
        json = {
          success: true,
          source: 'stays-live',
          from: p.from,
          to: p.to,
          guests: p.guests ?? 1,
          total: data.length,
          data,
        };
      }
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(json));
      }, 450);
      return;
    }
    const file = path.join(dir, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const type =
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.woff2': 'font/woff2',
        '.svg': 'image/svg+xml',
      }[path.extname(file)] || 'application/octet-stream';
    let data = fs.readFileSync(file);
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
    if (/javascript|css|html/.test(type)) {
      data = zlib.gzipSync(data);
      headers['Content-Encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(data);
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
const results = [];
for (const profile of [
  { name: 'mobile', width: 390, height: 844, dpr: 2, cpu: 4 },
  { name: 'desktop', width: 1280, height: 900, dpr: 1, cpu: 1 },
]) {
  for (let repetition = 1; repetition <= 3; repetition++)
    for (const [variant, port] of [
      ['before', 3183],
      ['after', 3184],
    ]) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.dpr,
        isMobile: profile.name === 'mobile',
        hasTouch: profile.name === 'mobile',
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const photos = new Map();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      cdp.on('Network.responseReceived', (e) => {
        if (e.response.url.startsWith('https://crcn.stays.net/image/'))
          photos.set(e.requestId, { url: e.response.url, status: e.response.status, bytes: 0 });
      });
      cdp.on('Network.loadingFinished', (e) => {
        const p = photos.get(e.requestId);
        if (p) p.bytes = e.encodedDataLength;
      });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 500000,
        uploadThroughput: 125000,
        connectionType: 'cellular4g',
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      await page.addInitScript(() => {
        window.__perf = { lcp: [], shifts: [] };
        new PerformanceObserver((l) => {
          window.__perf.lcp.push(
            ...l.getEntries().map((e) => ({ time: e.startTime, url: e.url, size: e.size })),
          );
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => {
          window.__perf.shifts.push(
            ...l
              .getEntries()
              .filter((e) => !e.hadRecentInput)
              .map((e) => ({ time: e.startTime, value: e.value })),
          );
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
      const data = await page.evaluate(() => {
        let cls = 0,
          sum = 0,
          first = 0,
          last = 0;
        for (const e of window.__perf.shifts) {
          if (e.time - last > 1000 || e.time - first > 5000) {
            first = e.time;
            sum = 0;
          }
          sum += e.value;
          last = e.time;
          cls = Math.max(cls, sum);
        }
        return {
          lcp: window.__perf.lcp.at(-1),
          cls,
          overflow: document.documentElement.scrollWidth > innerWidth,
          primary: [...document.images].slice(0, 1).map((e) => ({
            currentSrc: e.currentSrc,
            width: e.width,
            naturalWidth: e.naturalWidth,
            loading: e.loading,
            priority: e.fetchPriority,
            top: e.getBoundingClientRect().top,
          })),
          highPriority: document.querySelectorAll('img[fetchpriority="high"]').length,
          asset: [...document.scripts].map((e) => e.src).find((s) => s.includes('/assets/index-')),
          observedMs: performance.now(),
        };
      });
      const row = {
        variant,
        profile: profile.name,
        repetition,
        data,
        photos: [...photos.values()],
        photoBytes: [...photos.values()].reduce((a, p) => a + p.bytes, 0),
        errors,
      };
      results.push(row);
      fs.writeFileSync(`${output}/benchmark.json`, JSON.stringify(results, null, 2));
      console.log(
        JSON.stringify({
          variant,
          profile: profile.name,
          repetition,
          lcp: data.lcp?.time,
          cls: data.cls,
          photoBytes: row.photoBytes,
          primary: data.primary[0],
          high: data.highPriority,
          errors,
        }),
      );
      await context.close();
    }
}
await browser.close();
await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
