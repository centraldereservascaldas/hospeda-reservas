import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
});

const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { MeasurementPreferences } = await import('../src/components/MeasurementPreferences.tsx');

const { loadGtmIfConsented, readMeasurementConsent, saveMeasurementConsent } =
  await import('../src/utils/measurementConsent.ts');

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.head.innerHTML = '';
  delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
});

test('defaults to no consent and persists refusal', () => {
  assert.equal(readMeasurementConsent(), null);
  saveMeasurementConsent({ analytics: false, advertising: false });
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
  assert.equal(loadGtmIfConsented(readMeasurementConsent()!, 'GTM-ABC123'), false);
  assert.equal(document.querySelector('script'), null);
});

test('requires both choices and valid GTM ID, then inserts a single script', () => {
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: false }, 'GTM-ABC123'), false);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'invalid'), false);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123'), true);
  assert.equal(loadGtmIfConsented({ analytics: true, advertising: true }, 'GTM-ABC123'), true);
  assert.equal(document.querySelectorAll('#crcn-gtm-script').length, 1);
  assert.equal(
    document.querySelector<HTMLScriptElement>('#crcn-gtm-script')?.src,
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123',
  );
});

test('revocation persists and prevents loading on the next page', () => {
  saveMeasurementConsent({ analytics: true, advertising: true });
  saveMeasurementConsent({ analytics: false, advertising: false });
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
  assert.equal(loadGtmIfConsented(readMeasurementConsent()!, 'GTM-ABC123'), false);
});

test('preference UI refuses by default and can be reopened after saving', () => {
  const view = render(React.createElement(MeasurementPreferences, { showReopenButton: true }));
  assert.equal(document.activeElement, view.getByRole('heading', { name: 'Preferências de medição' }));
  fireEvent.click(view.getByRole('button', { name: 'Recusar' }));
  assert.deepEqual(readMeasurementConsent(), { analytics: false, advertising: false });
  const reopen = view.getByRole('button', { name: 'Preferências de medição' });
  assert.equal(document.activeElement, reopen);
  fireEvent.click(reopen);
  assert.equal(document.activeElement, view.getByRole('heading', { name: 'Preferências de medição' }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Permitir medição e publicidade' }));
  fireEvent.click(view.getByRole('button', { name: 'Salvar escolhas' }));
  assert.deepEqual(readMeasurementConsent(), { analytics: true, advertising: true });
  assert.equal(document.activeElement, view.getByRole('button', { name: 'Preferências de medição' }));
});
