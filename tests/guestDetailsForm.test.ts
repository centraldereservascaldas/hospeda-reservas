import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
});
const React = (await import('react')).default;
const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { GuestDetailsForm } = await import('../src/components/booking/GuestDetailsForm.tsx');

test('guest form sends to the reservation with its credential and shows success only after confirmation', async () => {
  const previousFetch = globalThis.fetch;
  let call: { url: string; init?: Parameters<typeof fetch>[1] } | undefined;
  globalThis.fetch = (async (
    url: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    call = { url: String(url), init };
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const reference = 'a'.repeat(40);
    const token = 'b'.repeat(64);
    const view = render(
      React.createElement(GuestDetailsForm, {
        reference,
        credentials: { type: 'resume-token', resumeToken: token },
      }),
    );
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Pessoa Teste' } });
    fireEvent.change(view.getByLabelText('CPF ou documento'), { target: { value: '12345678909' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '11999999999' } });
    fireEvent.click(view.getByRole('button', { name: 'Enviar dados dos hóspedes' }));
    await waitFor(() => assert.ok(view.getByText('Dados registrados na reserva.')));
    assert.equal(call?.url, `/api/checkout/${reference}/guests`);
    assert.equal((call?.init?.headers as Record<string, string>)['X-Checkout-Resume-Token'], token);
    assert.deepEqual(JSON.parse(String(call?.init?.body)), {
      holder: { name: 'Pessoa Teste', document: '12345678909', phone: '11999999999' },
      companions: [],
    });
  } finally {
    globalThis.fetch = previousFetch;
    cleanup();
    dom.window.close();
  }
});
