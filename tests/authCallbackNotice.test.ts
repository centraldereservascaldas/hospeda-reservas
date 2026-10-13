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
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const { AuthCallbackNotice } = await import('../src/components/account/AuthCallbackNotice.tsx');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('announces callback errors and dismisses the notice', () => {
  let dismissed = 0;
  const { getByRole, getByText } = render(
    React.createElement(AuthCallbackNotice, {
      message: 'Não foi possível confirmar o e-mail.',
      isError: true,
      onDismiss: () => {
        dismissed += 1;
      },
    }),
  );

  assert.ok(getByRole('alert'));
  assert.ok(getByText('Não foi possível confirmar o e-mail.'));
  fireEvent.click(getByRole('button', { name: 'Fechar aviso' }));
  assert.equal(dismissed, 1);
});

test('announces successful callback notices with status semantics', () => {
  const { getByRole } = render(
    React.createElement(AuthCallbackNotice, {
      message: 'E-mail confirmado.',
      isError: false,
      onDismiss: () => {},
    }),
  );

  assert.ok(getByRole('status'));
});
