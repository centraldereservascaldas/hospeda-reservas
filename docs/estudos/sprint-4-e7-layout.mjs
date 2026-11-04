import fs from 'node:fs';
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e7-layout';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await context.newPage();
  await page.addInitScript((fixture) => {
    if (fixture) {
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
    }
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__shifts.push({
          time: entry.startTime,
          value: entry.value,
          sources: entry.sources.map((source) => ({
            tag: source.node?.tagName,
            id: source.node?.id,
            classes: String(source.node?.className || '').slice(0, 200),
            text: source.node?.textContent?.slice(0, 100),
            before: source.previousRect.toJSON(),
            after: source.currentRect.toJSON(),
          })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }, process.env.CRCN_BASELINE_FIXTURE === 'true');
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
  await page.goto(process.env.CRCN_BASELINE_URL || 'http://127.0.0.1:3192/', {
    waitUntil: 'domcontentloaded',
  });
  await page.screenshot({ path: `${output}/initial.png` });
  await page.waitForTimeout(Number(process.env.CRCN_LAYOUT_WAIT_MS || 6000));
  await page.screenshot({ path: `${output}/loaded.png` });
  const shifts = await page.evaluate(() => window.__shifts);
  fs.writeFileSync(`${output}/shifts.json`, JSON.stringify(shifts, null, 2));
  console.log(JSON.stringify(shifts));
} finally {
  await browser.close();
}
