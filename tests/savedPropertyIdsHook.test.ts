import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const { act, cleanup, renderHook } = await import('@testing-library/react');
const { useSavedPropertyIds } = await import('../src/hooks/useSavedPropertyIds.ts');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('hydrates validated IDs and persists toggles', async () => {
  localStorage.setItem('hospeda_wishlist', '["JQ08G",3,"prop-demo"]');
  const hook = renderHook(() => useSavedPropertyIds());

  assert.deepEqual(hook.result.current.savedPropertyIds, ['JQ08G']);
  await act(async () => hook.result.current.toggleSavedProperty('custom-listing'));
  assert.deepEqual(hook.result.current.savedPropertyIds, ['JQ08G', 'custom-listing']);
  assert.equal(
    localStorage.getItem('hospeda_wishlist'),
    JSON.stringify(['JQ08G', 'custom-listing']),
  );

  await act(async () => hook.result.current.toggleSavedProperty('JQ08G'));
  assert.deepEqual(hook.result.current.savedPropertyIds, ['custom-listing']);
});
