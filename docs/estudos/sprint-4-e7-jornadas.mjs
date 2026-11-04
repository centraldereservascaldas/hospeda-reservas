import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.CRCN_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CRCN_BASELINE_URL || 'http://127.0.0.1:3192/';
const output = process.env.CRCN_BASELINE_OUTPUT || '/tmp/crcn-e7-journeys';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CRCN_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CRCN_CHROMIUM_EXECUTABLE }
    : {}),
});
const records = [];
const profiles = [
  { name: 'small', width: 320, height: 844 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1365, height: 900 },
];
const countCards = (page) => page.locator('article:has([data-property-detail-trigger])').count();
const waitForCards = (page, count) =>
  page.waitForFunction(
    (expected) =>
      document.querySelectorAll('article [data-property-detail-trigger]').length === expected,
    count,
  );
async function dismissConsent(page) {
  const reject = page.getByRole('button', { name: 'Recusar', exact: true });
  if (await reject.isVisible()) await reject.click();
}
async function clearScenario(page) {
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.delete('__fixture');
    history.replaceState(history.state, '', url);
  });
}
try {
  for (const profile of profiles) {
    if (process.env.CRCN_PROFILE && process.env.CRCN_PROFILE !== profile.name) continue;
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [],
      posts = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
    });
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
    const row = { profile, status: 'running' };
    try {
      const url = new URL('?from=2026-11-06&to=2026-11-08&guests=2', base);
      await page.goto(url.href);
      await waitForCards(page, 12);
      await dismissConsent(page);
      const more = page.getByRole('button', { name: 'Carregar mais', exact: true });
      await more.focus();
      await page.keyboard.press('Enter');
      await waitForCards(page, 24);
      assert.equal(await more.evaluate((element) => element === document.activeElement), true);
      const trigger = page.locator('[data-property-detail-trigger="test-12"]');
      await trigger.focus();
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Apartamento teste 13', exact: true }).waitFor();
      await page.getByText('Disponibilidade e valores atualizados', { exact: true }).waitFor();
      row.bookingActionEnabled = await page
        .getByRole('button', { name: 'Continuar para reserva', exact: true })
        .first()
        .isEnabled();
      assert.equal(row.bookingActionEnabled, true);
      const photo = page.getByRole('button', {
        name: 'Ampliar foto principal de Apartamento teste 13',
        exact: true,
      });
      await photo.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('dialog', { name: 'Apartamento teste 13', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await photo.evaluate((element) => element === document.activeElement), true);
      await page.getByRole('button', { name: 'Voltar para resultados', exact: true }).click();
      await waitForCards(page, 24);
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('data-property-detail-trigger') === 'test-12',
      );
      const scrollAfter = await page.evaluate(() => scrollY);
      assert.ok(
        Math.abs(scrollBefore - scrollAfter) <= 2,
        `scroll changed: ${scrollBefore} → ${scrollAfter}`,
      );
      row.returnedCards = await countCards(page);
      row.scrollDifference = scrollAfter - scrollBefore;
      assert.equal(posts.filter((path) => path === '/api/search').length, 2);
      row.searchRequestsAfterReturn = 2;
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: `${output}/${profile.name}-returned.png` });
      url.searchParams.set('__fixture', 'empty');
      await page.goto(url.href);
      await page
        .getByRole('heading', {
          name: 'Nenhuma acomodação disponível para esse período',
          exact: true,
        })
        .waitFor();
      assert.equal(await countCards(page), 0);
      row.empty = true;
      url.searchParams.set('__fixture', 'search-error');
      await page.goto(url.href);
      await page.getByRole('alert').filter({ hasText: 'Não foi possível' }).waitFor();
      await dismissConsent(page);
      await clearScenario(page);
      await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
      await waitForCards(page, 12);
      row.errorRetry = true;
      url.searchParams.set('__fixture', 'pagination-error');
      await page.goto(url.href);
      await waitForCards(page, 12);
      await dismissConsent(page);
      await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
      await page.getByRole('button', { name: 'Tentar carregar mais', exact: true }).waitFor();
      assert.equal(await countCards(page), 12);
      await clearScenario(page);
      await page.getByRole('button', { name: 'Tentar carregar mais', exact: true }).click();
      await waitForCards(page, 24);
      row.paginationRetry = true;
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      assert.ok(posts.every((path) => ['/api/search', '/api/price'].includes(path)));
      row.status = 'passed';
      row.pageErrors = errors;
      row.posts = posts;
    } catch (error) {
      row.status = 'failed';
      row.error = error.message;
      row.overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll('body *')]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              id: element.id,
              classes: String(element.className).slice(0, 140),
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          })
          .filter((rect) => rect.right > innerWidth + 1 || rect.left < -1)
          .slice(0, 20),
      }));
      await page.screenshot({ path: `${output}/${profile.name}-failed.png` });
      throw error;
    } finally {
      records.push(row);
      fs.writeFileSync(`${output}/journeys.json`, JSON.stringify(records, null, 2));
      await context.close();
    }
  }
  console.log(JSON.stringify(records));
} finally {
  await browser.close();
}
