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
const { createPortal } = await import('react-dom');
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { useDialogFocus } = await import('../src/components/useDialogFocus.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('contains keyboard focus and returns focus to the opener after Escape', () => {
  function Dialog({ onClose }: { onClose: () => void }) {
    const dialogRef = useDialogFocus(true, onClose);
    return React.createElement(
      'div',
      {
        ref: dialogRef,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dialog-title',
        'data-dialog-focus-root': true,
        tabIndex: -1,
      },
      React.createElement('h2', { id: 'dialog-title' }, 'Search stays'),
      React.createElement('button', { type: 'button' }, 'First action'),
      React.createElement('button', { type: 'button' }, 'Last action'),
    );
  }

  function Harness() {
    const [isOpen, setIsOpen] = React.useState(true);
    const openerRef = React.useRef<HTMLButtonElement>(null);
    React.useLayoutEffect(() => {
      openerRef.current?.focus();
    }, []);

    return React.createElement(
      React.Fragment,
      null,
      React.createElement('button', { ref: openerRef, type: 'button' }, 'Open search'),
      isOpen ? React.createElement(Dialog, { onClose: () => setIsOpen(false) }) : null,
    );
  }

  render(React.createElement(Harness));
  const dialog = document.querySelector('[role="dialog"]');
  const [first, last] = Array.from(dialog?.querySelectorAll('button') ?? []);
  const opener = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === 'Open search',
  );

  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'dialog-title');
  assert.equal(
    document.activeElement?.textContent,
    'First action',
    'opening focuses the first control',
  );

  last?.focus();
  fireEvent.keyDown(last!, { key: 'Tab' });
  assert.equal(document.activeElement?.textContent, 'First action', 'Tab from last wraps to first');

  first?.focus();
  fireEvent.keyDown(first!, { key: 'Tab', shiftKey: true });
  assert.equal(
    document.activeElement?.textContent,
    'Last action',
    'Shift+Tab from first wraps to last',
  );

  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(document.querySelector('[role="dialog"]'), null, 'Escape closes the dialog');
  assert.equal(document.activeElement, opener, 'closing restores focus to the opener');
});

test('includes marked portals in the dialog tab loop without letting their Escape close the dialog', () => {
  function Dialog({ onClose }: { onClose: () => void }) {
    const dialogRef = useDialogFocus(true, onClose);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'div',
        {
          ref: dialogRef,
          role: 'dialog',
          'aria-modal': 'true',
          'data-dialog-focus-root': true,
          tabIndex: -1,
        },
        React.createElement('button', { type: 'button' }, 'First in dialog'),
        React.createElement('button', { type: 'button' }, 'Last in dialog'),
      ),
      createPortal(
        React.createElement(
          'div',
          { 'data-dialog-focus-portal': true },
          React.createElement('button', { type: 'button' }, 'Portaled option'),
        ),
        document.body,
      ),
    );
  }

  let closeCount = 0;
  render(
    React.createElement(Dialog, {
      onClose: () => {
        closeCount += 1;
      },
    }),
  );

  const first = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === 'First in dialog',
  )!;
  const last = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === 'Last in dialog',
  )!;
  const portaledOption = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === 'Portaled option',
  )!;

  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  assert.equal(document.activeElement, portaledOption);

  fireEvent.keyDown(portaledOption, { key: 'Tab' });
  assert.equal(document.activeElement, first);
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, portaledOption);

  fireEvent.keyDown(portaledOption, { key: 'Escape' });
  assert.equal(closeCount, 0, 'Escape from the popover is left for its own close handler');
});
