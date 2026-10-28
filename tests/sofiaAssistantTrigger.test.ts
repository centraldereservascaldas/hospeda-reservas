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
const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { SofiaAssistantTrigger } =
  await import('../src/components/assistant/SofiaAssistantTrigger.tsx');

afterEach(() => {
  cleanup();
  if (originalGetBoundingClientRect) {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    originalGetBoundingClientRect = null;
  }
  document.body.innerHTML = '';
});

let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect | null = null;

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
    name: /Sofia • Assistente virtual.*Tire dúvidas sobre hospedagens/,
  });
  assert.match(trigger.textContent || '', /Sofia • Assistente virtual/);
  assert.equal(trigger.getAttribute('type'), 'button');
  fireEvent.click(trigger);
  assert.equal(openCalls, 1);
});

test('can hide the floating mobile trigger when an inline assistant shortcut is present', () => {
  const { container } = render(
    React.createElement(SofiaAssistantTrigger, {
      onOpen: () => {},
      showMobileFloating: false,
    }),
  );

  assert.match(container.firstElementChild?.className || '', /hidden/);
  assert.match(container.firstElementChild?.className || '', /sm:block/);
});

test('compacts the floating assistant when a mobile empty-state action needs space', () => {
  const { container, getByRole } = render(
    React.createElement(SofiaAssistantTrigger, {
      onOpen: () => {},
      compactMobileFloating: true,
    }),
  );

  const trigger = getByRole('button', {
    name: /Sofia • Assistente virtual.*Tire dúvidas sobre hospedagens/,
  });
  assert.match(trigger.className, /max-width:639px\)_and_\(max-height:639px\)\]:h-11/);
  assert.match(trigger.className, /max-width:639px\)_and_\(max-height:639px\)\]:w-11/);
  assert.match(
    container.querySelector('.flex.flex-col.text-left')?.className || '',
    /max-width:639px\)_and_\(max-height:639px\)\]:sr-only/,
  );
});

test('hides and removes the assistant trigger from focus while it overlaps the booking panel', async () => {
  document.body.innerHTML = '<div class="property-booking-panel"></div>';
  originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('property-booking-panel')) {
      return {
        x: 700,
        y: 500,
        width: 300,
        height: 300,
        left: 700,
        top: 500,
        right: 1000,
        bottom: 800,
        toJSON: () => ({}),
      } as DOMRect;
    }

    if (this.classList.contains('fixed')) {
      return {
        x: 760,
        y: 540,
        width: 320,
        height: 70,
        left: 760,
        top: 540,
        right: 1080,
        bottom: 610,
        toJSON: () => ({}),
      } as DOMRect;
    }

    return (
      originalGetBoundingClientRect?.call(this) ??
      ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
      } as DOMRect)
    );
  };

  const { container } = render(
    React.createElement(SofiaAssistantTrigger, {
      onOpen: () => {},
    }),
  );

  await waitFor(() => {
    assert.match(container.firstElementChild?.className || '', /invisible pointer-events-none/);
    assert.equal(container.firstElementChild?.getAttribute('aria-hidden'), 'true');
    assert.equal(container.firstElementChild?.hasAttribute('inert'), true);
  });
});
