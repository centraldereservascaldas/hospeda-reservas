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

const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { SofiaAssistantTrigger } =
  await import('../src/components/assistant/SofiaAssistantTrigger.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('Sofia trigger includes its visible text in its accessible name and opens the assistant', () => {
  let openCalls = 0;
  const { getByRole } = render(
    React.createElement(SofiaAssistantTrigger, {
      onOpen: () => {
        openCalls += 1;
      },
    }),
  );

  const trigger = getByRole('button', {
    name: /Sofia • Concierge IA.*Tire dúvidas sobre os resorts/,
  });
  assert.match(trigger.textContent || '', /Sofia • Concierge IA/);
  assert.equal(trigger.getAttribute('type'), 'button');
  fireEvent.click(trigger);
  assert.equal(openCalls, 1);
});
