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
const React = await import('react');
const { render, cleanup, act, fireEvent, waitFor } = await import('@testing-library/react');
const { useDiscoveryVisibility } =
  await import('../src/components/search/useDiscoveryVisibility.ts');
const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
const originalRect = HTMLElement.prototype.getBoundingClientRect;
const keys = ['first', 'second', 'below'];
function Harness() {
  const root = React.useRef<HTMLDivElement>(null);
  const visible = useDiscoveryVisibility(root, keys);
  return React.createElement(
    'div',
    { ref: root },
    React.createElement(
      'div',
      { 'data-scroller': 'yes', style: { overflowX: 'auto' } },
      ...keys.map((key) =>
        React.createElement('button', { key, 'data-discovery-query': key }, key),
      ),
    ),
    React.createElement('output', null, [...visible].sort().join(',')),
  );
}
afterEach(() => {
  cleanup();
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  if (originalObserver) Object.defineProperty(globalThis, 'IntersectionObserver', originalObserver);
  else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

test('starts at the visibility threshold and avoids cancelling for a small layout shift', async () => {
  let callback!: ConstructorParameters<typeof IntersectionObserver>[0];
  let disconnected = false;
  Object.assign(globalThis, {
    IntersectionObserver: class {
      constructor(cb: ConstructorParameters<typeof IntersectionObserver>[0]) {
        callback = cb;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  const view = render(React.createElement(Harness));
  const element = view.getByRole('button', { name: 'first' });
  const emit = (ratio: number) =>
    act(() =>
      callback(
        [
          {
            target: element,
            intersectionRatio: ratio,
            isIntersecting: ratio > 0,
            boundingClientRect: element.getBoundingClientRect(),
            intersectionRect: element.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      ),
    );
  emit(0.2);
  assert.equal(view.getByRole('status').textContent, '');
  emit(0.4);
  assert.equal(view.getByRole('status').textContent, 'first');
  emit(0.2);
  assert.equal(view.getByRole('status').textContent, 'first');
  emit(0);
  assert.equal(view.getByRole('status').textContent, '');
  view.unmount();
  assert.equal(disconnected, true);
});

test('geometry fallback follows vertical and horizontal scrolling and removes its listeners', async () => {
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  let shifted = false;
  let measured = 0;
  const rect = (left: number, top: number, width: number, height: number) => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    measured++;
    if (this.hasAttribute('data-scroller')) return rect(0, 0, 200, 400);
    const key = this.getAttribute('data-discovery-query');
    if (key === 'first') return rect(shifted ? -200 : 20, 20, 100, 100);
    if (key === 'second') return rect(shifted ? 30 : 230, 20, 100, 100);
    if (key === 'below') return rect(20, 2000, 100, 100);
    return rect(0, 0, 200, 400);
  };
  const view = render(React.createElement(Harness));
  await waitFor(() => assert.equal(view.getByRole('status').textContent, 'first'));
  shifted = true;
  fireEvent.scroll(view.container.querySelector('[data-scroller]')!);
  await waitFor(() => assert.equal(view.getByRole('status').textContent, 'second'));
  view.unmount();
  const before = measured;
  fireEvent.scroll(window);
  fireEvent.resize(window);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(measured, before);
});
