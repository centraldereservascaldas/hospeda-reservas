import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
(
  dom.window.HTMLElement.prototype as unknown as {
    scrollTo: (options?: { top?: number }) => void;
    scrollTop: number;
  }
).scrollTo = function scrollTo({ top } = {}): void {
  this.scrollTop = top ?? 0;
};
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const { GuestAccountModal } = await import('../src/components/account/GuestAccountModal.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('account dialog respects mobile safe areas, short viewports and focus return', () => {
  const opener = document.createElement('button');
  opener.textContent = 'Abrir conta';
  document.body.append(opener);
  opener.focus();
  let isOpen = true;
  const close = () => {
    isOpen = false;
  };
  const { getByRole, rerender, queryByRole } = render(
    React.createElement(GuestAccountModal, {
      isOpen,
      initialMode: 'login',
      onClose: close,
      returnFocusRef: { current: opener },
    }),
  );

  const dialog = getByRole('dialog', { name: 'Minha conta' });
  const closeButton = getByRole('button', { name: 'Fechar janela da conta' });
  const scrollableContent = dialog.querySelector('.overflow-y-auto.overscroll-contain');
  const overlay = dialog.parentElement;

  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(document.activeElement, closeButton);
  assert.equal(closeButton.classList.contains('h-11'), true);
  assert.equal(closeButton.classList.contains('w-11'), true);
  assert.ok(scrollableContent);
  assert.equal(scrollableContent?.classList.contains('min-h-0'), true);
  assert.match(dialog.style.maxHeight, /100dvh/);
  assert.match(dialog.style.maxHeight, /safe-area-inset-top/);
  assert.match(dialog.style.maxHeight, /safe-area-inset-bottom/);
  assert.match(overlay?.getAttribute('style') || '', /safe-area-inset-left/);
  assert.match(overlay?.getAttribute('style') || '', /safe-area-inset-right/);

  fireEvent.click(closeButton);
  assert.equal(isOpen, false);
  rerender(
    React.createElement(GuestAccountModal, {
      isOpen,
      initialMode: 'login',
      onClose: close,
      returnFocusRef: { current: opener },
    }),
  );
  assert.equal(queryByRole('dialog'), null);
  assert.equal(document.activeElement, opener);
});
