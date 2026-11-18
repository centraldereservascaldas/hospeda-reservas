// Instrumentação de E0: navegação pública; não cria reservas nem altera configuração.
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e0-baseline';
fs.mkdirSync(output, { recursive: true });
const results = [];
for (let repetition = 1; repetition <= 3; repetition++) {
  const context = await browser.newContext({
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
  await page.addInitScript(() => {
    window.__searchBaseline = { firstQuotedCardMs: null, events: [] };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        if (e.interactionId)
          window.__searchBaseline.events.push({
            duration: e.duration,
            id: e.interactionId,
            type: e.name,
          });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    setInterval(() => {
      const cards = [...document.querySelectorAll('article')].filter((x) =>
        x.querySelector('[data-property-detail-trigger]'),
      );
      if (
        !window.__searchBaseline.firstQuotedCardMs &&
        cards.some(
          (x) =>
            /R\$/.test(x.textContent) && /Disponível nas datas selecionadas/.test(x.textContent),
        )
      )
        window.__searchBaseline.firstQuotedCardMs = performance.now();
    }, 100);
  });
  const requests = [];
  const responses = [];
  const pending = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/search')) requests.push(r.postDataJSON());
  });
  page.on('response', (r) => {
    if (r.url().endsWith('/api/search'))
      pending.push(
        r
          .json()
          .then((j) =>
            responses.push({
              params: r.request().postDataJSON(),
              status: r.status(),
              count: j.data?.length,
              quoted: j.data?.filter((x) => x.calculatedPrice?.totalAmount > 0).length,
            }),
          )
          .catch(() => {}),
      );
  });
  await page.goto(
    'https://www.centraldereservascaldas.com/?from=2026-11-06&to=2026-11-08&guests=2',
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await page.waitForTimeout(20000);
  await Promise.allSettled(pending);
  const data = await page.evaluate(() => ({
    observedUntilMs: performance.now(),
    firstQuotedCardMs: window.__searchBaseline.firstQuotedCardMs,
    cards: [...document.querySelectorAll('article')]
      .filter((x) => x.querySelector('[data-property-detail-trigger]'))
      .map((x) => ({
        quoted: /R\$/.test(x.textContent),
        available: /Disponível nas datas selecionadas/.test(x.textContent),
      })),
    assets: [...document.scripts].map((x) => x.src).filter((x) => x.includes('/assets/')),
  }));
  const interactions = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const button = page.getByRole('button', { name: 'Datas e hóspedes', exact: true }).first();
    if (!(await button.count())) {
      interactions.push({ attempt, skipped: 'button not found' });
      break;
    }
    const start = await page.evaluate(() => performance.now());
    await button.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    interactions.push({
      attempt,
      start,
      events: await page.evaluate(() => window.__searchBaseline.events),
    });
  }
  const row = {
    repetition,
    started: new Date().toISOString(),
    data,
    requests,
    responses,
    interactions,
  };
  results.push(row);
  fs.writeFileSync(`${output}/search-runs.json`, JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify({
      repetition,
      firstQuotedCardMs: data.firstQuotedCardMs,
      cards: data.cards.length,
      quoted: data.cards.filter((x) => x.quoted).length,
      searches: requests.length,
      interactionEvents: interactions.at(-1)?.events?.length,
    }),
  );
  await context.close();
}
await browser.close();
