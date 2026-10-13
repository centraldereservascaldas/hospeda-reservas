import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(dom.window, {
  requestAnimationFrame: (callback: (timestamp: number) => void) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { render, fireEvent, cleanup, within } = await import('@testing-library/react');
const { SearchModal } = await import('../src/components/search/SearchModal.tsx');
const { createDefaultSearchFilters } = await import('../src/utils/searchUrlState.ts');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');
const originalGetResorts = crcnBackendApi.getResorts;

crcnBackendApi.getResorts = async () => [];

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  crcnBackendApi.getResorts = originalGetResorts;
});

test('search mode tabs expose selection and support arrow, Home, and End keys', () => {
  render(
    React.createElement(SearchModal, {
      isOpen: true,
      onClose: () => {},
      filters: createDefaultSearchFilters(),
      onApplyFilters: () => {},
      onResetFilters: () => {},
      onSearchInApp: () => {},
    }),
  );

  const dialog = within(document.querySelector('[role="dialog"]')!);
  const tablist = dialog.getByRole('tablist', { name: 'Tipo de busca' });
  const tabs = within(tablist).getAllByRole('tab');
  const panel = dialog.getByRole('tabpanel');
  assert.equal(tabs.length, 4);
  assert.equal(tabs[0]?.getAttribute('aria-selected'), 'true');
  assert.equal(tabs[0]?.getAttribute('tabindex'), '0');
  assert.equal(panel.getAttribute('aria-labelledby'), tabs[0]?.id);

  tabs[0]?.focus();
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  assert.equal(document.activeElement, tabs[1]);
  assert.equal(tabs[1]?.getAttribute('aria-selected'), 'true');
  assert.equal(tabs[1]?.getAttribute('tabindex'), '0');
  assert.equal(tabs[0]?.getAttribute('tabindex'), '-1');
  assert.equal(panel.getAttribute('aria-labelledby'), tabs[1]?.id);

  fireEvent.keyDown(tabs[1]!, { key: 'End' });
  assert.equal(document.activeElement, tabs[3]);
  assert.equal(tabs[3]?.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(tabs[3]!, { key: 'Home' });
  assert.equal(document.activeElement, tabs[0]);
  assert.equal(tabs[0]?.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
  assert.equal(document.activeElement, tabs[3]);
  assert.equal(tabs[3]?.getAttribute('aria-selected'), 'true');
});
