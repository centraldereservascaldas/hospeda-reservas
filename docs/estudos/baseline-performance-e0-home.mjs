// Instrumentação de E0: navegação pública; não cria reservas nem altera configuração.
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e0-baseline';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
const profiles = [
  {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    cpu: 4,
  },
  {
    name: 'desktop',
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpu: 1,
  },
];
const target = process.env.CRCN_BASELINE_URL || 'https://www.centraldereservascaldas.com/';
const results = [];
const safeUrl = (s) => {
  const u = new URL(s);
  return u.origin + u.pathname;
};
const selectedProfiles = profiles.filter(
  (profile) => !process.env.CRCN_PROFILE || profile.name === process.env.CRCN_PROFILE,
);
const firstRepetition = Number(process.env.CRCN_REPETITION_START || 1);
if (!selectedProfiles.length || !Number.isSafeInteger(firstRepetition) || firstRepetition < 1)
  throw new Error('Invalid profile or repetition start.');
for (const profile of selectedProfiles) {
  for (let repetition = firstRepetition; repetition < firstRepetition + 3; repetition++) {
    const { name, cpu, ...options } = profile;
    const context = await browser.newContext({
      ...options,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = await context.newPage();
    if (process.env.CRCN_BASELINE_FIXTURE === 'true') {
      await page.addInitScript(() => {
        const substitute = (value) =>
          /^https?:\/\//.test(value) && new URL(value).origin !== location.origin
            ? new URL('/__fixture-image.svg', location.href).href
            : value;
        const originalAttribute = HTMLImageElement.prototype.setAttribute;
        HTMLImageElement.prototype.setAttribute = function (name, value) {
          const attribute = name.toLowerCase();
          return originalAttribute.call(
            this,
            name,
            attribute === 'src'
              ? substitute(String(value))
              : attribute === 'srcset'
                ? '/__fixture-image.svg 640w'
                : value,
          );
        };
        for (const name of ['src', 'srcset']) {
          const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, name);
          Object.defineProperty(HTMLImageElement.prototype, name, {
            ...original,
            set(value) {
              original.set.call(
                this,
                name === 'src' ? substitute(String(value)) : '/__fixture-image.svg 640w',
              );
            },
          });
        }
      });
    }
    await page.addInitScript(() => {
      window.__baseline = {
        lcp: [],
        shifts: [],
        events: [],
        firstVisibleQuote: null,
        firstCatalogCard: null,
      };
      for (const [type, key] of [
        ['largest-contentful-paint', 'lcp'],
        ['layout-shift', 'shifts'],
        ['event', 'events'],
      ]) {
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              if (key === 'lcp')
                window.__baseline.lcp.push({ time: e.startTime, size: e.size, url: e.url });
              if (key === 'shifts' && !e.hadRecentInput)
                window.__baseline.shifts.push({ time: e.startTime, value: e.value });
              if (key === 'events' && e.interactionId)
                window.__baseline.events.push({
                  name: e.name,
                  duration: e.duration,
                  interactionId: e.interactionId,
                  time: e.startTime,
                });
            }
          }).observe({
            type,
            buffered: true,
            ...(key === 'events' ? { durationThreshold: 16 } : {}),
          });
        } catch {}
      }
      setInterval(() => {
        const b = window.__baseline;
        if (!b.firstCatalogCard && document.querySelector('article [data-property-detail-trigger]'))
          b.firstCatalogCard = performance.now();
        if (!b.firstVisibleQuote) {
          const nodes = document.querySelectorAll('button[aria-label],article');
          for (const node of nodes) {
            const label = node.getAttribute('aria-label') || node.textContent;
            const r = node.getBoundingClientRect();
            if (
              /R\$/.test(label) &&
              r.bottom > 0 &&
              r.top < innerHeight &&
              r.right > 0 &&
              r.left < innerWidth
            ) {
              b.firstVisibleQuote = performance.now();
              break;
            }
          }
        }
      }, 100);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 500000,
      uploadThroughput: 125000,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    for (const cache of ['cold', 'warm']) {
      const id = `${name}-${cache}-${repetition}`;
      const requests = [],
        responses = [],
        failures = [],
        finished = [];
      let active = 0,
        maxActive = 0;
      const onReq = (r) => {
        if (r.url().includes('/api/')) {
          active++;
          maxActive = Math.max(maxActive, active);
          requests.push({
            url: safeUrl(r.url()),
            method: r.method(),
            params: r.url().endsWith('/api/search') ? r.postDataJSON() : undefined,
          });
        }
      };
      const onFinished = (r) => {
        if (r.url().includes('/api/')) active--;
      };
      const onFailed = (r) => {
        if (r.url().includes('/api/')) active--;
        failures.push({ url: safeUrl(r.url()), error: r.failure()?.errorText });
      };
      const onRes = (r) => {
        const h = r.headers();
        responses.push({
          url: safeUrl(r.url()),
          status: r.status(),
          cache: h['cache-control'],
          cdn: h['cf-cache-status'],
        });
      };
      const onLoaded = (e) => finished.push(e.encodedDataLength);
      page.on('request', onReq);
      page.on('requestfinished', onFinished);
      page.on('requestfailed', onFailed);
      page.on('response', onRes);
      cdp.on('Network.loadingFinished', onLoaded);
      const started = new Date().toISOString();
      let navigationError = null;
      try {
        await page.goto(target, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
      } catch (e) {
        navigationError = e.message.split('\n')[0];
      }
      await page.waitForTimeout(20000);
      const data = await page.evaluate(() => {
        const b = window.__baseline;
        let maxCls = 0,
          sessionSum = 0,
          start = 0,
          last = 0;
        for (const e of b.shifts) {
          if (e.time - last > 1000 || e.time - start > 5000) {
            start = e.time;
            sessionSum = 0;
          }
          sessionSum += e.value;
          last = e.time;
          maxCls = Math.max(maxCls, sessionSum);
        }
        const n = performance.getEntriesByType('navigation')[0];
        return {
          observedUntilMs: performance.now(),
          ttfbMs: n.responseStart,
          dclMs: n.domContentLoadedEventEnd,
          loadMs: n.loadEventEnd,
          fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
          lcp: b.lcp.at(-1),
          cls: maxCls,
          firstVisibleQuoteMs: b.firstVisibleQuote,
          firstCatalogCardMs: b.firstCatalogCard,
          resources: performance.getEntriesByType('resource').map((e) => ({
            url: new URL(e.name).origin + new URL(e.name).pathname,
            durationMs: e.duration,
            transferBytes: e.transferSize,
            decodedBytes: e.decodedBodySize,
          })),
          imageCount: document.images.length,
          articleCount: document.querySelectorAll('article').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          assets: [...document.scripts].map((e) => e.src).filter((s) => s.includes('/assets/')),
          firstImages: [...document.images].slice(0, 5).map((e) => ({
            url: e.currentSrc,
            width: e.width,
            naturalWidth: e.naturalWidth,
            loading: e.loading,
          })),
          timeOrigin: performance.timeOrigin,
        };
      });
      page.off('request', onReq);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
      page.off('response', onRes);
      cdp.off('Network.loadingFinished', onLoaded);
      const row = {
        id,
        started,
        profile,
        cache,
        repetition,
        browser: browser.version(),
        navigationError,
        data,
        requests,
        responses,
        failures,
        maxConcurrentApi: maxActive,
        completedTransferBytes: finished.reduce((a, b) => a + b, 0),
      };
      results.push(row);
      fs.writeFileSync(`${output}/runs.json`, JSON.stringify(results, null, 2));
      console.log(
        JSON.stringify({
          id,
          lcp: data.lcp?.time,
          cls: data.cls,
          quote: data.firstVisibleQuoteMs,
          catalog: data.firstCatalogCardMs,
          searches: requests.filter((x) => x.url.endsWith('/api/search')).length,
          api: requests.length,
          bytes: row.completedTransferBytes,
          failures: failures.length,
          assets: data.assets,
        }),
      );
    }
    await context.close();
  }
}
await browser.close();
