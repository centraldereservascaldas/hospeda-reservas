// Availability reads only: never opens checkout or creates orders.
import fs from 'node:fs';
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e7-renovacao';
const target = process.env.CRCN_BASELINE_URL || 'https://www.centraldereservascaldas.com/';
const fixture = process.env.CRCN_EXPIRY_FIXTURE === 'true';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE } : {}),
});
const results = [];
try {
  for (const remainingSeconds of fixture ? [2, 3] : [null]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await context.newPage();
    const responses = [], errors = [];
    let calls = 0;
    if (fixture) {
      await page.route('**/api/search', async route => {
        calls += 1;
        const response = await route.fetch();
        const json = await response.json();
        const now = Math.floor(Date.now() / 1000) * 1000;
        const seconds = calls === 1 ? 5 : calls === 2 ? remainingSeconds : 45;
        json.meta = { fetchedAt: new Date(now - (45 - seconds) * 1000).toISOString(), expiresAt: new Date(now + seconds * 1000).toISOString() };
        await route.fulfill({ response, json, headers: { ...response.headers(), date: new Date(now).toUTCString() } });
      });
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', async response => {
      if (new URL(response.url()).pathname !== '/api/search') return;
      const json = await response.json().catch(() => ({}));
      responses.push({ observedAt: new Date().toISOString(), status: response.status(), date: response.headers()['date'], meta: json.meta, count: json.data?.length });
    });
    await page.goto(new URL('?from=2026-11-06&to=2026-11-08&guests=2', target).href, { waitUntil: 'domcontentloaded' });
    const cards = page.locator('article').filter({ has: page.locator('[data-property-detail-trigger]') });
    await cards.filter({ hasText: 'R$' }).first().waitFor({ timeout: 15000 });
    const before = { cards: await cards.count(), quoted: await cards.filter({ hasText: 'R$' }).count() };
    const refresh = page.getByRole('button', { name: 'Atualizar disponibilidade', exact: true });
    await refresh.waitFor({ timeout: 65000 });
    const expired = { cards: await cards.count(), quoted: await cards.filter({ hasText: 'R$' }).count() };
    await refresh.click();
    await cards.filter({ hasText: 'R$' }).first().waitFor({ timeout: 12000 });
    await page.waitForTimeout(6000);
    const after = { cards: await cards.count(), quoted: await cards.filter({ hasText: 'R$' }).count(), retry: await page.getByRole('button', { name: 'Tentar atualizar novamente', exact: true }).count() };
    const result = { remainingSeconds, before, expired, after, responses, errors, status: after.quoted === before.quoted && after.quoted > 0 && after.retry === 0 && errors.length === 0 && expired.cards === before.cards && expired.quoted === 0 ? 'passed' : 'failed' };
    results.push(result);
    fs.writeFileSync(`${output}/renewal.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(result));
    await context.close();
    if (result.status !== 'passed') throw new Error('Availability renewal did not remain usable.');
  }
} finally {
  await browser.close();
}
