// Instrumentação de E0: abre a busca e fecha com Escape; não envia o formulário.
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
const target = process.env.CRCN_BASELINE_URL || 'https://www.centraldereservascaldas.com/';
const results = [];
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e0-baseline';
fs.mkdirSync(output, { recursive: true });
for (const profile of [
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
]) {
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
  await page.addInitScript(() => {
    window.__events = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        if (e.interactionId)
          window.__events.push({
            id: e.interactionId,
            type: e.name,
            duration: e.duration,
            start: e.startTime,
          });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  await page.goto(new URL('?from=2026-11-06&to=2026-11-08&guests=2', target).href, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(12000);
  const interactions = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = await page.evaluate(() => performance.now());
    await page
      .getByRole('button', { name: /^Buscar hospedagens:/ })
      .first()
      .click({ timeout: 5000 });
    await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const events = await page.evaluate((t) => window.__events.filter((e) => e.start >= t), start);
    interactions.push({
      attempt,
      events,
      maxEventDurationMs: events.length ? Math.max(...events.map((e) => e.duration)) : null,
    });
  }
  results.push({
    profile,
    interactions,
    assets: await page.evaluate(() =>
      [...document.scripts].map((x) => x.src).filter((x) => x.includes('/assets/index-')),
    ),
  });
  fs.writeFileSync(`${output}/interaction-runs.json`, JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify({ profile: name, interactions: interactions.map((x) => x.maxEventDurationMs) }),
  );
  await context.close();
}
await browser.close();
