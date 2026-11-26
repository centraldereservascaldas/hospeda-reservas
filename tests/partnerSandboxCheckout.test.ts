import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/checkout-preview/parceiro?propertyId=imobsys-crcn-2-663&from=2027-05-17&to=2027-05-19&guests=2&baseCents=52300',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  sessionStorage: dom.window.sessionStorage,
  FormData: dom.window.FormData,
  getComputedStyle: dom.window.getComputedStyle,
});
const React = (await import('react')).default;
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { PartnerSandboxCheckout } =
  await import('../src/components/booking/PartnerSandboxCheckout.tsx');
const { partnerSandboxCheckoutApi } = await import('../src/services/partnerSandboxCheckoutApi.ts');
const original = { ...partnerSandboxCheckoutApi };
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  Object.assign(partnerSandboxCheckoutApi, original);
});

test('shows the server total and requires a separate confirmation before creating a test payment', async () => {
  let paid = 0;
  let submitted: unknown;
  partnerSandboxCheckoutApi.create = async (input) => {
    submitted = input;
    return { reference: 'A'.repeat(40), paymentCents: 52300, status: 'quoted' };
  };
  partnerSandboxCheckoutApi.startPayment = async () => {
    paid++;
    return { pix: 'TEST-PIX' };
  };
  render(React.createElement(PartnerSandboxCheckout));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Teste' } });
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '64999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferir valor' }));
  await waitFor(() => assert.ok(screen.getByText(/Valor total do pagamento de teste/)));
  assert.match(screen.getByText(/Valor total do pagamento de teste/).textContent || '', /523,00/);
  assert.equal(paid, 0);
  assert.deepEqual(submitted, {
    propertyId: 'imobsys-crcn-2-663',
    from: '2027-05-17',
    to: '2027-05-19',
    guests: 2,
    acceptedBaseCents: 52300,
    method: 'pix',
    customer: { fullName: 'Pessoa Teste', cpf: '12345678901', phone: '64999999999' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento de teste' }));
  await waitFor(() => assert.equal(paid, 1));
  assert.equal((screen.getByLabelText('Pix de teste') as HTMLTextAreaElement).value, 'TEST-PIX');
});

test('restores a quoted card order and displays its server total without initiating payment', async () => {
  sessionStorage.setItem('partner-sandbox-reference', 'B'.repeat(40));
  let paid = 0;
  partnerSandboxCheckoutApi.status = async () => ({
    status: 'quoted',
    method: 'card',
    paymentCents: 60000,
  });
  partnerSandboxCheckoutApi.startPayment = async () => {
    paid++;
    return {};
  };
  render(React.createElement(PartnerSandboxCheckout));
  await waitFor(() => assert.ok(screen.getByLabelText('Token de cartão sandbox')));
  assert.match(screen.getByText(/Valor total do pagamento de teste/).textContent || '', /600,00/);
  assert.equal(paid, 0);
  assert.equal(
    (screen.getByRole('button', { name: 'Confirmar pagamento de teste' }) as HTMLButtonElement)
      .disabled,
    true,
  );
});
