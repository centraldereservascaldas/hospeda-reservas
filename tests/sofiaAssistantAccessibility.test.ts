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
const { render, cleanup, fireEvent, waitFor } = await import('@testing-library/react');
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

test('generates an existing checkout link only from the explicitly entered code', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ success: true, reservation: { code: 'AB123', paymentEnabled: true } }),
    );
  try {
    const view = render(
      React.createElement(SofiaAssistantModal, {
        isOpen: true,
        onClose: () => {},
        currency: 'BRL',
        onSelectProperty: () => {},
      }),
    );
    fireEvent.click(view.getByRole('button', { name: 'Gerar link para reserva existente' }));
    assert.equal(view.queryByRole('link', { name: /Abrir checkout/ }), null);
    const input = view.getByRole('textbox', { name: 'Código da reserva' });
    fireEvent.change(input, { target: { value: 'ab123' } });
    fireEvent.click(view.getByRole('button', { name: 'Gerar link' }));
    await waitFor(() =>
      assert.equal(
        view.getByRole('link', { name: 'Abrir checkout da reserva AB123' }).getAttribute('href'),
        '/checkout/AB123',
      ),
    );
    assert.match(view.getByText(/A consulta verifica/).textContent || '', /reavaliadas/);
    fireEvent.change(input, { target: { value: 'ZZ' } });
    assert.equal(view.queryByRole('link', { name: /Abrir checkout/ }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not expose a link when existing checkout is disabled', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  try {
    const view = render(
      React.createElement(SofiaAssistantModal, {
        isOpen: true,
        onClose: () => {},
        currency: 'BRL',
        onSelectProperty: () => {},
      }),
    );
    fireEvent.click(view.getByRole('button', { name: 'Gerar link para reserva existente' }));
    fireEvent.change(view.getByRole('textbox', { name: 'Código da reserva' }), {
      target: { value: 'AB123' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Gerar link' }));
    await waitFor(() => assert.ok(view.getByRole('alert')));
    assert.equal(view.queryByRole('link', { name: /Abrir checkout/ }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const [description, payload] of [
  ['success false', { success: false, reservation: { code: 'AB123', paymentEnabled: true } }],
  ['different code', { success: true, reservation: { code: 'CD456', paymentEnabled: true } }],
  ['payment disabled', { success: true, reservation: { code: 'AB123', paymentEnabled: false } }],
] as const) {
  test(`does not expose a link for ${description}`, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify(payload));
    };
    try {
      const view = render(
        React.createElement(SofiaAssistantModal, {
          isOpen: true,
          onClose: () => {},
          currency: 'BRL',
          onSelectProperty: () => {},
        }),
      );
      fireEvent.click(view.getByRole('button', { name: 'Gerar link para reserva existente' }));
      fireEvent.change(view.getByRole('textbox', { name: 'Código da reserva' }), {
        target: { value: 'AB123' },
      });
      fireEvent.click(view.getByRole('button', { name: 'Gerar link' }));
      await waitFor(() => assert.ok(view.getByRole('alert')));
      assert.equal(view.queryByRole('link', { name: /Abrir checkout/ }), null);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
