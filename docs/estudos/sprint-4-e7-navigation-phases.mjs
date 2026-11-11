// HTML navigation only. Application JavaScript is disabled; no booking or API actions.
import fs from 'node:fs';
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
const target = process.env.CRCN_BASELINE_URL || 'https://www.centraldereservascaldas.com/';
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e7-navigation-phases';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
const rows = [];
try {
  for (let repetition = 1; repetition <= 3; repetition++) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 500000,
      uploadThroughput: 125000,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let apiRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests += 1;
    });
    let documentNetwork = null;
    cdp.on('Network.responseReceived', (event) => {
      if (event.type === 'Document')
        documentNetwork = { protocol: event.response.protocol, timing: event.response.timing };
    });
    for (const cache of ['cold', 'warm']) {
      documentNetwork = null;
      const startedAt = new Date().toISOString();
      const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(250);
      const headers = response.headers();
      const data = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return {
          dnsMs: n.domainLookupEnd - n.domainLookupStart,
          connectionMs: n.connectEnd - n.connectStart,
          tlsMs: n.secureConnectionStart > 0 ? n.connectEnd - n.secureConnectionStart : 0,
          requestWaitMs: n.responseStart - n.requestStart,
          ttfbMs: n.responseStart,
          responseEndMs: n.responseEnd,
          dclMs: n.domContentLoadedEventEnd,
          nextHopProtocol: n.nextHopProtocol,
          serverTiming: n.serverTiming.map((entry) => ({
            name: entry.name,
            duration: entry.duration,
          })),
          entry: [...document.scripts]
            .map((script) => new URL(script.src || location.href).pathname)
            .find((path) => path.startsWith('/assets/index-')),
        };
      });
      rows.push({
        repetition,
        cache,
        startedAt,
        status: response.status(),
        apiRequests,
        cacheControl: headers['cache-control'],
        cdnCache: headers['cf-cache-status'],
        cdnPop: headers['cf-ray']?.split('-').at(-1),
        data,
        documentNetwork,
      });
      fs.writeFileSync(`${output}/navigation-phases.json`, JSON.stringify(rows, null, 2));
      console.log(JSON.stringify(rows.at(-1)));
      if (response.status() !== 200 || apiRequests !== 0 || !data.entry)
        throw new Error('Navigation-only probe did not match the public application.');
    }
    await context.close();
  }
} finally {
  await browser.close();
}
