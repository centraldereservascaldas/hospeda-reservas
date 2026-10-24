import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});
Object.defineProperty(dom.window, 'matchMedia', {
  configurable: true,
  value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => {},
});

const React = (await import('react')).default;
const { render, cleanup } = await import('@testing-library/react');
const { SofiaAssistantModal } = await import('../src/components/assistant/SofiaAssistantModal.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('Sofia chat exposes named controls and a polite conversation log', () => {
  const { getByRole } = render(
    React.createElement(SofiaAssistantModal, {
      isOpen: true,
      onClose: () => {},
      currency: 'BRL',
      onSelectProperty: () => {},
    }),
  );

  const dialog = getByRole('dialog', { name: 'Sofia' });
  const input = getByRole('textbox', { name: 'Mensagem para Sofia' });
  const log = getByRole('log', { name: 'Conversa com Sofia' });
  const sendButton = getByRole('button', { name: 'Enviar mensagem para Sofia' });

  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(log.getAttribute('aria-live'), 'polite');
  assert.equal(log.getAttribute('aria-relevant'), 'additions text');
  assert.equal(document.activeElement, input);
  assert.match(input.className, /text-base/);
  assert.equal(sendButton.hasAttribute('disabled'), true);
  assert.match(log.querySelector('p')?.parentElement?.className ?? '', /text-sm/);
});
