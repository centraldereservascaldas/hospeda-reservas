import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/checkout/ZY92K' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle });
const React = (await import('react')).default;
const { render, waitFor, cleanup, fireEvent } = await import('@testing-library/react');
const { ExistingReservationCheckout } = await import('../src/components/booking/ExistingReservationCheckout.tsx');
after(() => dom.window.close());
afterEach(() => window.sessionStorage.clear());

test('existing reservation displays server data without enabling payment', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, reservation: {
    code: 'ZY92K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
    checkIn: '2026-11-13', checkOut: '2026-11-16', guests: 4, adults: 4, children: 0, infants: 0,
    totalCents: 39500, candidateBalanceCents: 19750, balanceStatus: 'pending_candidate', paymentEnabled: false, paymentMethods: [], cardInstallments: [],
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(view.getByText('Apartamento Exemplo')));
    assert.ok(view.getByText(/13\/11\/2026 – 16\/11\/2026/));
    assert.ok(view.getAllByText(/197,50/).length > 0);
    assert.match(view.getByRole('status').textContent || '', /Saldo em aberto/);
    assert.equal(view.queryByRole('button', { name: /pagar/i }), null);
    assert.equal(new URLSearchParams(window.location.search).get('adultos'), '4');
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('an unrecorded candidate is shown for review without offering payment', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, reservation: {
    code: 'ZX91K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
    checkIn: '2026-11-19', checkOut: '2026-11-22', guests: 4, adults: 4, children: 0, infants: 0,
    totalCents: 101600, candidateBalanceCents: 101600, balanceStatus: 'unrecorded_candidate', paymentEnabled: false, paymentMethods: [], cardInstallments: [],
  } }), { status: 200 });
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
    await waitFor(() => assert.ok(view.getAllByText('Em aberto').length > 0));
    assert.match(view.getAllByText(/1\.016,00/)[0].textContent || '', /1\.016,00/);
    assert.equal(view.queryByRole('button', { name: /pagar/i }), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('checkout identifies Pix accessibly and does not imply unavailable card installments', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, reservation: {
    code: 'ZY92K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
    checkIn: '2026-11-13', checkOut: '2026-11-16', guests: 4, adults: 4, children: 0, infants: 0,
    totalCents: 39500, candidateBalanceCents: 19750, balanceStatus: 'pending_candidate', paymentEnabled: true, paymentMethods: ['pix', 'card'], cardInstallments: [1, 3, 6],
  } }), { status: 200 });
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Pague com Pix' })));
    assert.equal((view.getByLabelText('Telefone') as HTMLInputElement).type, 'tel');
    fireEvent.click(view.getByLabelText('Cartão · parcelas disponíveis'));
    assert.deepEqual(view.getAllByRole('option').map((option) => (option as HTMLOptionElement).value), ['1', '3', '6']);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('accessible reservation details and card pricing follow the chosen installments before payment', async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? 'GET');
    return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZX91K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2030-11-19', checkOut: '2030-11-22', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 99500, candidateBalanceCents: 99500, balanceStatus: 'unrecorded_candidate', paymentEnabled: true, paymentMethods: ['pix', 'card'], cardInstallments: [1, 2, 3, 4, 5, 6],
    } }), { status: 200 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
    await waitFor(() => assert.ok(view.getByRole('region', { name: 'Dados e pagamento da reserva' })));
    assert.ok(view.getByRole('heading', { name: 'Apartamento Exemplo' }));
    assert.ok(view.getByText(/19\/11\/2030 – 22\/11\/2030/));
    assert.ok(view.getByRole('heading', { name: 'Pague com Pix' }));
    assert.ok(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/));
    fireEvent.click(view.getByLabelText('Cartão em até 6x'));
    const select = view.getByLabelText(/^Parcelamento/);
    assert.match(select.parentElement?.textContent ?? '', /1\.058,40/);
    fireEvent.change(select, { target: { value: '3' } });
    assert.match(select.parentElement?.textContent ?? '', /1\.137,15/);
    fireEvent.change(select, { target: { value: '6' } });
    assert.match(select.parentElement?.textContent ?? '', /1\.213,42/);
    const pay = view.getByRole('button', { name: /Confirmar e pagar/ }) as HTMLButtonElement;
    assert.match(pay.textContent ?? '', /6x de até R\$\s*202,24/);
    assert.equal(pay.disabled, true);
    fireEvent.click(view.getByRole('checkbox', { name: /Confirmo o pagamento/ }));
    assert.equal(pay.disabled, false);
    assert.deepEqual(methods, ['GET']);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('experimental unrecorded balance starts a pending Pix only after explicit customer confirmation', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'J'.repeat(40);
  const token = 'K'.repeat(64);
  const expiry = new Date(Date.now() + 60_000).toISOString();
  const requests: Array<{ url: string; method: string }> = [];
  const attempt = { status: 'pending', method: 'pix', amount: '1016.00', currency: 'BRL', expiresAt: expiry, paidAt: null, pix: { copyPaste: 'synthetic-pix-code', qrCodeBase64: 'c3ludGhldGlj' } };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZX91K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2026-11-19', checkOut: '2026-11-22', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 101600, candidateBalanceCents: 101600, balanceStatus: 'unrecorded_candidate', paymentEnabled: true, paymentMethods: ['pix'], cardInstallments: [],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZX91K/checkout')) return new Response(JSON.stringify({
      success: true, resume: { reference, token, path: `/checkout/${reference}`, expiresAt: expiry },
      order: { publicReference: reference, status: 'pre_reservado', paymentStatus: null, quoteTotal: '1016.00' },
      payment: { enabled: true, provider: 'cielo_sandbox' },
    }), { status: 201 });
    if (url.endsWith('/payments')) return new Response(JSON.stringify({ success: true, code: 'created', message: 'Aguardando', replayed: false, payment: attempt }), { status: 201 });
    if (url.endsWith(`/checkout/${reference}`)) return new Response(JSON.stringify({ success: true,
      order: { publicReference: reference, origin: 'stays_existing', status: 'pagamento_pendente', reservationConfirmed: false, listingId: 'LISTING', guestName: 'Cliente Exemplo', from: '2026-11-19', to: '2026-11-22', quoteTotal: '1016.00', currency: 'BRL', paymentStatus: 'pending', expiresAt: expiry, createdAt: null },
      confirmation: null, payment: { enabled: true, methods: ['pix'], publicKey: null, provider: 'cielo_sandbox', attempt },
    }), { status: 200 });
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
    await waitFor(() => assert.ok(view.getAllByText('Em aberto').length > 0));
    assert.ok(view.getByText(/Este valor está em aberto/));
    assert.ok(view.getByText(/depois que a Cielo confirmar a transação/i));
    assert.equal(requests.some((request) => request.method !== 'GET'), false);
    assert.equal(view.queryByText(/pagamento confirmado/i), null);
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), { target: { value: '12345678901' } });
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: /gerar pix/i }));
    await waitFor(() => assert.ok(view.getByLabelText('Código Pix copia e cola')));
    assert.equal((view.getByLabelText('Código Pix copia e cola') as HTMLTextAreaElement).value, 'synthetic-pix-code');
    assert.equal(view.queryByText(/pagamento confirmado/i), null);
    assert.equal(requests.filter((request) => request.url.endsWith('/payments') && request.method === 'POST').length, 1);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('experimental unrecorded balance shows selected card price and submits only a token in six installments', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'M'.repeat(40);
  const token = 'N'.repeat(64);
  const calls: Array<{ url: string; init?: Parameters<typeof fetch>[1] }> = [];
  window.bpSop_silentOrderPost = (options) => options.onSuccess({ PaymentToken: '11111111-1111-4111-8111-111111111111' });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZX91K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2026-11-19', checkOut: '2026-11-22', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 101600, candidateBalanceCents: 101600, balanceStatus: 'unrecorded_candidate', paymentEnabled: true, paymentMethods: ['pix', 'card'], cardInstallments: [1, 2, 3, 4, 5, 6],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZX91K/checkout')) return new Response(JSON.stringify({
      success: true, resume: { reference, token, path: `/checkout/${reference}`, expiresAt: new Date(Date.now() + 86400000).toISOString() },
      order: { publicReference: reference, status: 'pre_reservado', paymentStatus: null, quoteTotal: '1016.00' },
      payment: { enabled: true, provider: 'cielo_sandbox' },
    }), { status: 201 });
    if (url.endsWith('/payments/cielo-sop-token')) return new Response(JSON.stringify({ success: true, environment: 'sandbox', accessToken: 'synthetic-sop-access-token' }), { status: 200 });
    if (url.endsWith('/payments')) return new Response(JSON.stringify({ success: true, code: 'rejected', message: 'Não aprovado', replayed: false, payment: {
      status: 'rejected', method: 'card', amount: '1239.03', baseAmount: '1016.00', currency: 'BRL', expiresAt: null, paidAt: null, pix: null,
    } }), { status: 201 });
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.click(view.getByLabelText('Cartão em até 6x'));
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText('Número do cartão'), { target: { value: '4111111111111111' } });
    fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
    fireEvent.change(view.getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(view.getByLabelText('Nome no cartão'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail do titular'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular'), { target: { value: '12345678901' } });
    fireEvent.change(view.getByLabelText(/^Parcelamento/), { target: { value: '6' } });
    assert.match(view.getByRole('button', { name: /confirmar e pagar/i }).textContent ?? '', /6x de até R\$\s*206,51/);
    assert.match(view.getByLabelText(/^Parcelamento/).parentElement?.textContent ?? '', /1\.239,03/);
    assert.equal(calls.some((call) => call.init?.method === 'POST'), false);
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.ok(calls.some((call) => call.url.endsWith('/payments'))));
    const createCall = calls.find((call) => call.url.endsWith('/existing-reservations/ZX91K/checkout'));
    const payCall = calls.find((call) => call.url.endsWith('/payments'));
    assert.equal(JSON.parse(String(createCall?.init?.body)).installments, 6);
    assert.equal(JSON.parse(String(payCall?.init?.body)).installments, 6);
    assert.equal(JSON.stringify(calls).includes('4111111111111111'), false);
  } finally {
    cleanup();
    delete window.bpSop_silentOrderPost;
    globalThis.fetch = originalFetch;
  }
});

test('reservation lookup failure provides retry and a support link without a fictional payment method', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 503 }); };
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
    await waitFor(() => assert.ok(view.getByRole('alert')));
    const support = view.getByRole('link', { name: /whatsapp/i }) as HTMLAnchorElement;
    const message = new URL(support.href).searchParams.get('text')!;
    assert.ok(message.includes('ZX91K'));
    assert.equal(message.includes('Como quero pagar'), false);
    fireEvent.click(view.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => assert.equal(calls, 2));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

for (const [code, message] of [
  ['existing_checkout_already_started', /navegador em que ele foi iniciado/],
  ['existing_receivable_unconfirmed', /registro desta reserva está em conferência/],
] as const) {
  test(`checkout ${code} prevents another payment and explains how to proceed`, async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
        code: 'ZX91K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
        checkIn: '2026-11-19', checkOut: '2026-11-22', guests: 4, adults: 4, children: 0, infants: 0,
        totalCents: 101600, candidateBalanceCents: 101600, balanceStatus: 'unrecorded_candidate', paymentEnabled: true, paymentMethods: ['pix'], cardInstallments: [],
      } }), { status: 200 });
      return new Response(JSON.stringify({ success: false, code }), { status: code === 'existing_checkout_already_started' ? 409 : 503 });
    };
    try {
      window.history.replaceState(null, '', '/checkout/ZX91K');
      const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
      await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
      fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
      fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
      fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
      fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), { target: { value: '12345678901' } });
      fireEvent.click(view.getByRole('checkbox'));
      fireEvent.click(view.getByRole('button', { name: /gerar pix/i }));
      await waitFor(() => assert.match(view.getByRole('alert').textContent ?? '', message));
      assert.equal((view.getByRole('button', { name: /gerar pix/i }) as HTMLButtonElement).disabled, true);
      assert.ok(view.getByRole('link', { name: /whatsapp/i }));
      assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
      assert.equal(calls.some((call) => call.url.endsWith('/payments')), false);
    } finally {
      cleanup();
      globalThis.fetch = originalFetch;
    }
  });
}

test('an interrupted checkout preparation retries with the same idempotency key and does not send payment', async () => {
  const originalFetch = globalThis.fetch;
  const keys: string[] = [];
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZX91K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2030-11-19', checkOut: '2030-11-22', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 101600, candidateBalanceCents: 101600, balanceStatus: 'unrecorded_candidate', paymentEnabled: true, paymentMethods: ['pix'], cardInstallments: [],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZX91K/checkout')) {
      keys.push((init?.headers as Record<string, string>)['Idempotency-Key']);
      if (keys.length === 1) throw new TypeError('synthetic network failure');
      return new Response(JSON.stringify({ success: false, code: 'existing_receivable_unconfirmed' }), { status: 503 });
    }
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), { target: { value: '12345678901' } });
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: /gerar pix/i }));
    await waitFor(() => assert.match(view.getByRole('alert').textContent ?? '', /sem alterar os dados/));
    fireEvent.click(view.getByRole('button', { name: /gerar pix/i }));
    await waitFor(() => assert.match(view.getByRole('alert').textContent ?? '', /registro desta reserva está em conferência/));
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(calls.some((url) => url.endsWith('/payments')), false);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('a prepared card order keeps its payment method and installments fixed after a token error', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'E'.repeat(40);
  const token = 'F'.repeat(64);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZY92K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2026-11-13', checkOut: '2026-11-16', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 39500, candidateBalanceCents: 19750, balanceStatus: 'pending_candidate', paymentEnabled: true, paymentMethods: ['pix', 'card'], cardInstallments: [1, 2, 3, 4, 5, 6],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZY92K/checkout')) return new Response(JSON.stringify({
      success: true, resume: { reference, token, path: `/checkout/${reference}`, expiresAt: new Date(Date.now() + 86400000).toISOString() },
      order: { publicReference: reference, status: 'pre_reservado', paymentStatus: null, quoteTotal: '197.50' },
      payment: { enabled: true, provider: 'cielo_sandbox' },
    }), { status: 201 });
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.click(view.getByLabelText('Cartão em até 6x'));
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText('Número do cartão'), { target: { value: '4111111111111111' } });
    fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
    fireEvent.change(view.getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(view.getByLabelText('Nome no cartão'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail do titular'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular'), { target: { value: '12345678901' } });
    fireEvent.change(view.getByLabelText(/^Parcelamento/), { target: { value: '6' } });
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.ok(view.getByText(/forma de pagamento e as parcelas foram reservadas/)));
    assert.equal((view.getByLabelText(/^Parcelamento/) as HTMLSelectElement).disabled, true);
    assert.equal(view.getByLabelText('Pix').matches(':disabled'), true);
    assert.equal(view.getByLabelText('Cartão em até 6x').matches(':disabled'), true);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('Pix form creates a checkout and submits payment using only the resume token header', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: Parameters<typeof fetch>[1] }> = [];
  const reference = 'A'.repeat(40);
  const token = 'B'.repeat(64);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZY92K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2026-11-13', checkOut: '2026-11-16', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 39500, candidateBalanceCents: 19750, balanceStatus: 'pending_candidate', paymentEnabled: true, paymentMethods: ['pix'], cardInstallments: [],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZY92K/checkout')) return new Response(JSON.stringify({
      success: true, resume: { reference, token, path: `/checkout/${reference}`, expiresAt: new Date(Date.now() + 86400000).toISOString() },
      order: { publicReference: reference, status: 'pre_reservado', paymentStatus: null, quoteTotal: '197.50' },
      payment: { enabled: true, provider: 'cielo_sandbox' },
    }), { status: 201 });
    if (url.endsWith('/payments')) return new Response(JSON.stringify({ success: true, code: 'created', message: 'Aguardando', replayed: false, payment: {
      status: 'pending', method: 'pix', amount: '197.50', currency: 'BRL', expiresAt: null, paidAt: null,
      pix: { copyPaste: 'synthetic-pix-code', qrCodeBase64: 'c3ludGhldGlj' },
    } }), { status: 201 });
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K?utm_source=google&gclid=synthetic-click&token=not-a-credential');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), { target: { value: '12345678901' } });
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: /gerar pix/i }));
    await waitFor(() => assert.ok(calls.some((call) => call.url.endsWith('/payments'))));
    const paymentCall = calls.find((call) => call.url.endsWith('/payments'));
    assert.equal((paymentCall?.init?.headers as Record<string, string>)['X-Checkout-Resume-Token'], token);
    assert.equal(window.location.pathname, `/checkout/${reference}`);
    assert.equal(window.location.href.includes(token), false);
    assert.equal(new URLSearchParams(window.location.search).get('utm_source'), 'google');
    assert.equal(new URLSearchParams(window.location.search).get('gclid'), 'synthetic-click');
    assert.equal(new URLSearchParams(window.location.search).has('token'), false);
    const body = JSON.parse(String(paymentCall?.init?.body));
    assert.equal(body.paymentMethod, 'pix');
    assert.equal(body.payerIdentification.number, '12345678901');
    cleanup();
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const reopened = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    const link = reopened.getByRole('link', { name: 'Acompanhar pagamento' }) as HTMLAnchorElement;
    assert.equal(new URL(link.href).pathname, `/checkout/${reference}`);
    assert.equal(link.href.includes(token), false);
    await waitFor(() => assert.ok(reopened.getByText('Apartamento Exemplo')));
    assert.equal(reopened.queryByRole('button', { name: /gerar pix/i }), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('a prepared order with payment disabled never starts a Pix attempt', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'G'.repeat(40);
  const token = 'H'.repeat(64);
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZY92K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2026-11-13', checkOut: '2026-11-16', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 39500, candidateBalanceCents: 19750, balanceStatus: 'pending_candidate', paymentEnabled: true, paymentMethods: ['pix'], cardInstallments: [],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZY92K/checkout')) return new Response(JSON.stringify({
      success: true, resume: { reference, token, path: `/checkout/${reference}`, expiresAt: new Date(Date.now() + 86400000).toISOString() },
      order: { publicReference: reference, status: 'pre_reservado', paymentStatus: null, quoteTotal: '197.50' },
      payment: { enabled: false, provider: 'cielo_sandbox' },
    }), { status: 201 });
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), { target: { value: '12345678901' } });
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: /gerar pix/i }));
    await waitFor(() => assert.ok(view.getByRole('heading', { name: /não foi possível consultar agora/i })));
    assert.equal(calls.some((url) => url.endsWith('/payments')), false);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('card form sends the Cielo token and installments, not card details, to the backend', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: Parameters<typeof fetch>[1] }> = [];
  const reference = 'C'.repeat(40);
  const token = 'D'.repeat(64);
  const syntheticCard = '4111111111111111';
  window.bpSop_silentOrderPost = (options) => options.onSuccess({ PaymentToken: '11111111-1111-4111-8111-111111111111' });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/checkout-summary')) return new Response(JSON.stringify({ success: true, reservation: {
      code: 'ZY92K', listingId: 'LISTING', property: 'Apartamento Exemplo', image: null,
      checkIn: '2026-11-13', checkOut: '2026-11-16', guests: 4, adults: 4, children: 0, infants: 0,
      totalCents: 39500, candidateBalanceCents: 19750, balanceStatus: 'pending_candidate', paymentEnabled: true, paymentMethods: ['card'], cardInstallments: [6],
    } }), { status: 200 });
    if (url.endsWith('/existing-reservations/ZY92K/checkout')) return new Response(JSON.stringify({
      success: true, resume: { reference, token, path: `/checkout/${reference}`, expiresAt: new Date(Date.now() + 86400000).toISOString() },
      order: { publicReference: reference, status: 'pre_reservado', paymentStatus: null, quoteTotal: '197.50' },
      payment: { enabled: true, provider: 'cielo_sandbox' },
    }), { status: 201 });
    if (url.endsWith('/payments/cielo-sop-token')) return new Response(JSON.stringify({ success: true, environment: 'sandbox', accessToken: 'synthetic-sop-access-token' }), { status: 200 });
    if (url.endsWith('/payments')) return new Response(JSON.stringify({ success: true, code: 'approved', message: 'Aprovado', replayed: false, payment: {
      status: 'approved', method: 'card', amount: '240.86', baseAmount: '197.50', currency: 'BRL', expiresAt: null, paidAt: null, pix: null,
    } }), { status: 201 });
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('Nome completo'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText('Número do cartão'), { target: { value: syntheticCard } });
    fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
    fireEvent.change(view.getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(view.getByLabelText('Nome no cartão'), { target: { value: 'Cliente Exemplo' } });
    fireEvent.change(view.getByLabelText('E-mail do titular'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular'), { target: { value: '12345678901' } });
    assert.equal((view.getByLabelText(/^Parcelamento/) as HTMLSelectElement).value, '6');
    assert.equal(view.getAllByRole('option').length, 1);
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.ok(calls.some((call) => call.url.endsWith('/payments'))));
    const paymentCall = calls.find((call) => call.url.endsWith('/payments'));
    const body = JSON.parse(String(paymentCall?.init?.body));
    assert.equal(body.paymentMethod, 'card');
    assert.equal(body.installments, 6);
    assert.equal(body.token, '11111111-1111-4111-8111-111111111111');
    assert.equal(JSON.stringify(calls).includes(syntheticCard), false);
    assert.equal(window.location.href.includes(token), false);
  } finally {
    cleanup();
    delete window.bpSop_silentOrderPost;
    globalThis.fetch = originalFetch;
  }
});
