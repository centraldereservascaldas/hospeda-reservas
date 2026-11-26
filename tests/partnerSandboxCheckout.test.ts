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
const originalUrl = dom.window.location.href;
const originalKey = `partner-sandbox-reference:${JSON.stringify(['imobsys-crcn-2-663', '2027-05-17', '2027-05-19', '2'])}`;
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  dom.window.history.replaceState(null, '', originalUrl);
  Object.assign(partnerSandboxCheckoutApi, original);
  delete window.bpSop_silentOrderPost;
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
  sessionStorage.setItem(originalKey, 'B'.repeat(40));
  let paid = 0;
  partnerSandboxCheckoutApi.status = async () => ({
    status: 'quoted',
    method: 'card',
    paymentCents: 60000,
    installments: 6,
  });
  partnerSandboxCheckoutApi.startPayment = async () => {
    paid++;
    return {};
  };
  render(React.createElement(PartnerSandboxCheckout));
  await waitFor(() => assert.ok(screen.getByLabelText('Número do cartão de teste')));
  assert.match(screen.getByText(/Valor total do pagamento de teste/).textContent || '', /600,00/);
  assert.match(screen.getByText(/6 parcelas de até/).textContent || '', /100,00/);
  assert.equal(paid, 0);
  assert.equal(paid, 0);
});

test('card data goes to the Cielo SDK and only its token is sent to the backend', async () => {
  sessionStorage.setItem(originalKey, 'B'.repeat(40));
  partnerSandboxCheckoutApi.status = async () => ({
    status: 'quoted',
    method: 'card',
    paymentCents: 60000,
    installments: 6,
  });
  partnerSandboxCheckoutApi.cardToken = async () => ({
    environment: 'sandbox',
    accessToken: 'test-access-token',
  });
  let submitted: unknown;
  partnerSandboxCheckoutApi.startPayment = async (_reference, token) => {
    submitted = token;
    return {};
  };
  window.bpSop_silentOrderPost = (options) => {
    assert.equal(options.environment, 'sandbox');
    options.onSuccess({ PaymentToken: '22222222-2222-4222-8222-222222222222' });
  };
  render(React.createElement(PartnerSandboxCheckout));
  await waitFor(() => assert.ok(screen.getByLabelText('Número do cartão de teste')));
  fireEvent.change(screen.getByLabelText('Número do cartão de teste'), {
    target: { value: '4111111111111111' },
  });
  fireEvent.change(screen.getByLabelText('Validade'), { target: { value: '1230' } });
  fireEvent.change(screen.getByLabelText('Código de segurança'), { target: { value: '123' } });
  const cvvInput = screen.getByLabelText('Código de segurança') as HTMLInputElement;
  fireEvent.change(screen.getByLabelText('Nome no cartão'), { target: { value: 'Pessoa Teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento de teste' }));
  await waitFor(() => assert.equal(submitted, '22222222-2222-4222-8222-222222222222'));
  assert.equal(cvvInput.value, '');
});

test('reconciles a pending payment and displays a confirmed card rejection', async () => {
  sessionStorage.setItem(originalKey, 'D'.repeat(40));
  let queries = 0;
  let reconciliations = 0;
  partnerSandboxCheckoutApi.reconcile = async () => {
    reconciliations++;
    return { success: true };
  };
  partnerSandboxCheckoutApi.status = async () => {
    queries++;
    return {
      status: queries === 1 ? 'payment_pending' : 'payment_rejected',
      method: 'card',
      paymentCents: 60000,
    };
  };
  render(React.createElement(PartnerSandboxCheckout));
  await waitFor(() =>
    assert.match(screen.getByRole('status').textContent || '', /Pagamento de teste recusado/),
  );
  assert.equal(reconciliations, 1);
  assert.equal(screen.queryByRole('button', { name: 'Confirmar pagamento de teste' }), null);
});

test('a different property or stay never resumes a previous order', async () => {
  sessionStorage.setItem(originalKey, 'B'.repeat(40));
  dom.window.history.replaceState(
    null,
    '',
    '/checkout-preview/parceiro?propertyId=imobsys-crcn-2-664&from=2027-05-17&to=2027-05-19&guests=2&baseCents=52300',
  );
  let calls = 0;
  partnerSandboxCheckoutApi.status = async () => {
    calls++;
    return { status: 'quoted' };
  };
  render(React.createElement(PartnerSandboxCheckout));
  assert.equal((screen.getByLabelText('Imóvel') as HTMLInputElement).value, 'imobsys-crcn-2-664');
  assert.equal(calls, 0);
  assert.equal(sessionStorage.getItem(originalKey), 'B'.repeat(40));
});

test('a new quoted price for the same stay does not silently start a second order', async () => {
  sessionStorage.setItem(originalKey, 'B'.repeat(40));
  dom.window.history.replaceState(
    null,
    '',
    '/checkout-preview/parceiro?propertyId=imobsys-crcn-2-663&from=2027-05-17&to=2027-05-19&guests=2&baseCents=60000',
  );
  let resumed = '';
  partnerSandboxCheckoutApi.status = async (reference) => {
    resumed = reference;
    return { status: 'payment_pending', method: 'pix', paymentCents: 52300 };
  };
  render(React.createElement(PartnerSandboxCheckout));
  await waitFor(() => assert.equal(resumed, 'B'.repeat(40)));
  assert.equal(screen.queryByRole('button', { name: 'Conferir valor' }), null);
});

test('a lost creation response is retried with the same submission key', async () => {
  const keys: string[] = [];
  partnerSandboxCheckoutApi.create = async (_input, key) => {
    keys.push(key);
    if (keys.length === 1) throw new Error('response lost');
    return { reference: 'C'.repeat(40), paymentCents: 52300, status: 'quoted' };
  };
  render(React.createElement(PartnerSandboxCheckout));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Teste' } });
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '12345678901' } });
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '64999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferir valor' }));
  await waitFor(() =>
    assert.match(screen.getByRole('status').textContent || '', /Não foi possível criar/),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Conferir valor' }));
  await waitFor(() => assert.equal(keys.length, 2));
  assert.equal(keys[0], keys[1]);
  await waitFor(() => assert.ok(screen.getByText(/Valor total do pagamento de teste/)));
});
