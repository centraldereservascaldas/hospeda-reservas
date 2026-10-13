import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { cleanup, render } = await import('@testing-library/react');
const { DeferredModal } = await import('../src/components/DeferredModal.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('does not mount a deferred modal before first open and preserves it after close', () => {
  const lifecycle: string[] = [];

  function Child() {
    React.useEffect(() => {
      lifecycle.push('mounted');
      return () => {
        lifecycle.push('unmounted');
      };
    }, []);
    return React.createElement('div', null, 'Modal body');
  }

  const { rerender, queryByText } = render(
    React.createElement(DeferredModal, { active: false, children: React.createElement(Child) }),
  );
  assert.equal(queryByText('Modal body'), null);
  assert.deepEqual(lifecycle, []);

  rerender(
    React.createElement(DeferredModal, { active: true, children: React.createElement(Child) }),
  );
  assert.ok(queryByText('Modal body'));
  assert.deepEqual(lifecycle, ['mounted']);

  rerender(
    React.createElement(DeferredModal, { active: false, children: React.createElement(Child) }),
  );
  assert.ok(queryByText('Modal body'));
  assert.deepEqual(lifecycle, ['mounted']);
});
