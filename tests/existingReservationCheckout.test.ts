import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/checkout/ZY92K',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});
const React = (await import('react')).default;
const { render, waitFor, cleanup, fireEvent } = await import('@testing-library/react');
const { ExistingReservationCheckout } =
  await import('../src/components/booking/ExistingReservationCheckout.tsx');
const { getCheckoutResumeToken, saveCheckoutResumeToken } =
  await import('../src/utils/checkoutResumeStorage.ts');
const { saveExistingReservationResumeReference } =
  await import('../src/utils/existingReservationResumeStorage.ts');
after(() => dom.window.close());
afterEach(() => window.sessionStorage.clear());

test('recovers a lost checkout response without the reservation summary', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'r'.repeat(40);
  const token = 't'.repeat(64);
  const secret = 'a'.repeat(144);
  window.sessionStorage.setItem('crcn.existing-reservation.recovery.ZY92K:initial', secret);
  let secretSent = '';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/existing-reservations/ZY92K/recover')) {
      secretSent = new Headers(init?.headers).get('X-Checkout-Recovery-Secret') ?? '';
      return new Response(
        JSON.stringify({
          success: true,
          resume: { reference, token, expiresAt: '2099-01-01T00:00:00Z' },
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 503 });
  };
  try {
    render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.equal(getCheckoutResumeToken(reference), token));
    assert.equal(secretSent, secret);
    assert.equal(
      window.sessionStorage.getItem('crcn.existing-reservation.resume.ZY92K'),
      reference,
    );
    assert.equal(window.location.search.includes(secret), false);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

const contractResponse = () =>
  new Response(
    JSON.stringify({
      page: {
        slug: 'contrato',
        path: '/contrato',
        title: 'Contrato de hospedagem',
        version: '2026-11-18.1',
        publishedAt: '2026-11-18',
        contentHash: 'a'.repeat(64),
        sections: [{ title: 'Condições', content: 'Condições de hospedagem.' }],
      },
    }),
    { status: 200 },
  );

test('existing reservation displays server data without enabling payment', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZY92K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-13',
              checkOut: '2026-11-16',
              guests: 4,
              adults: 4,
              children: 0,
              infants: 0,
              totalCents: 39500,
              candidateBalanceCents: 19750,
              balanceStatus: 'pending_candidate',
              paymentEnabled: false,
              paymentMethods: [],
              cardInstallments: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByText('Apartamento Exemplo')));
    assert.ok(view.getByText(/13\/11\/2026 – 16\/11\/2026/));
    assert.ok(view.getAllByText(/197,50/).length > 0);
    assert.match(view.getByRole('status').textContent || '', /Saldo em aberto/);
    assert.equal(view.queryByRole('button', { name: /pagar/i }), null);
    assert.equal(new URLSearchParams(window.location.search).get('adults'), '4');
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('an unrecorded candidate is shown for review without offering payment', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZX91K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-19',
              checkOut: '2026-11-22',
              guests: 4,
              adults: 4,
              children: 0,
              infants: 0,
              totalCents: 101600,
              candidateBalanceCents: 101600,
              balanceStatus: 'unrecorded_candidate',
              paymentEnabled: false,
              paymentMethods: [],
              cardInstallments: [],
            },
          }),
          { status: 200 },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
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
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZY92K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-13',
              checkOut: '2026-11-16',
              guests: 4,
              adults: 4,
              children: 0,
              infants: 0,
              totalCents: 39500,
              candidateBalanceCents: 19750,
              balanceStatus: 'pending_candidate',
              paymentEnabled: true,
              paymentMethods: ['pix', 'card'],
              cardInstallments: [1, 3, 6],
            },
          }),
          { status: 200 },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Pague com Pix' })));
    assert.equal((view.getByLabelText('Telefone') as HTMLInputElement).type, 'tel');
    const phone = view.getByLabelText('Telefone') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '00123456789' } });
    assert.equal(phone.validity.valid, false);
    fireEvent.change(phone, { target: { value: '64999999999' } });
    assert.equal(phone.validity.valid, true);
    fireEvent.change(phone, { target: { value: '+55 64 99999-9999' } });
    assert.equal(phone.value, '(64) 99999-9999');
    assert.equal(phone.validity.valid, true);
    fireEvent.click(view.getByLabelText('Cartão · parcelas disponíveis'));
    fireEvent.click(view.getByRole('button', { name: /^Parcelamento/ }));
    assert.deepEqual(
      view.getAllByRole('option').map((option) => option.textContent?.trim().match(/^\d+x/)?.[0]),
      ['1x', '3x', '6x'],
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('accessible reservation details and card pricing follow the chosen installments before payment', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    requests.push({ url: String(input), method: init?.method ?? 'GET' });
    return new Response(
      JSON.stringify({
        success: true,
        reservation: {
          code: 'ZX91K',
          listingId: 'LISTING',
          property: 'Apartamento Exemplo',
          image: null,
          checkIn: '2030-11-19',
          checkOut: '2030-11-22',
          guests: 4,
          adults: 4,
          children: 0,
          infants: 0,
          totalCents: 99500,
          candidateBalanceCents: 99500,
          balanceStatus: 'unrecorded_candidate',
          paymentEnabled: true,
          paymentMethods: ['pix', 'card'],
          cardInstallments: [1, 2, 3, 4, 5, 6],
        },
      }),
      { status: 200 },
    );
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
    await waitFor(() =>
      assert.ok(view.getByRole('region', { name: 'Dados e pagamento da reserva' })),
    );
    assert.ok(view.getByRole('heading', { name: 'Apartamento Exemplo' }));
    assert.ok(view.getByText(/19\/11\/2030 – 22\/11\/2030/));
    assert.ok(view.getByRole('heading', { name: 'Pague com Pix' }));
    assert.ok(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/));
    fireEvent.click(view.getByLabelText('Cartão em até 6x'));
    const select = view.getByRole('button', { name: /^Parcelamento/ });
    assert.match(select.parentElement?.parentElement?.textContent ?? '', /1\.058,40/);
    fireEvent.click(select);
    fireEvent.click(view.getByRole('option', { name: /^3x/ }));
    assert.match(select.parentElement?.parentElement?.textContent ?? '', /1\.137,15/);
    fireEvent.click(select);
    fireEvent.click(view.getByRole('option', { name: /^6x/ }));
    assert.match(select.parentElement?.parentElement?.textContent ?? '', /1\.213,42/);
    const pay = view.getByRole('button', { name: /Confirmar e pagar/ }) as HTMLButtonElement;
    assert.match(pay.textContent ?? '', /6x de até R\$\s*202,24/);
    assert.equal(pay.disabled, false);
    const acceptance = view.getByRole('checkbox', { name: /Li e aceito as condições/ });
    fireEvent.invalid(acceptance);
    assert.ok(view.getByRole('alert', { name: '' }).textContent?.includes('Aceite as condições'));
    fireEvent.click(acceptance);
    assert.equal(pay.disabled, false);
    assert.equal(requests.filter(({ url }) => url.includes('/checkout-summary')).length, 1);
    assert.ok(requests.every(({ method }) => method === 'GET'));
    const summary =
      view.getByRole('complementary', { name: 'Resumo da reserva' }).textContent ?? '';
    assert.match(summary, /6x de até R\$\s*202,24/);
    assert.match(summary, /1\.213,42/);
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
  const attempt = {
    status: 'pending',
    method: 'pix',
    amount: '1016.00',
    currency: 'BRL',
    expiresAt: expiry,
    paidAt: null,
    pix: { copyPaste: 'synthetic-pix-code', qrCodeBase64: 'c3ludGhldGlj' },
  };
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZX91K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-19',
            checkOut: '2026-11-22',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 101600,
            candidateBalanceCents: 101600,
            balanceStatus: 'unrecorded_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZX91K/checkout'))
      return new Response(
        JSON.stringify({
          success: true,
          resume: { reference, token, path: `/checkout/${reference}`, expiresAt: expiry },
          order: {
            publicReference: reference,
            status: 'pre_reservado',
            paymentStatus: null,
            quoteTotal: '1016.00',
          },
          payment: { enabled: true, provider: 'cielo_sandbox' },
        }),
        { status: 201 },
      );
    if (url.endsWith('/payments'))
      return new Response(
        JSON.stringify({
          success: true,
          code: 'created',
          message: 'Aguardando',
          replayed: false,
          payment: attempt,
        }),
        { status: 201 },
      );
    if (url.endsWith(`/checkout/${reference}`))
      return new Response(
        JSON.stringify({
          success: true,
          order: {
            publicReference: reference,
            origin: 'stays_existing',
            status: 'pagamento_pendente',
            reservationConfirmed: false,
            listingId: 'LISTING',
            guestName: 'Cliente Exemplo',
            from: '2026-11-19',
            to: '2026-11-22',
            quoteTotal: '1016.00',
            currency: 'BRL',
            paymentStatus: 'pending',
            expiresAt: expiry,
            createdAt: null,
          },
          confirmation: null,
          payment: {
            enabled: true,
            methods: ['pix'],
            publicKey: null,
            provider: 'cielo_sandbox',
            attempt,
          },
        }),
        { status: 200 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getAllByText('Em aberto').length > 0));
    assert.ok(view.getByText(/Este valor está em aberto/));
    assert.ok(view.getByText(/depois que a Cielo confirmar a transação/i));
    assert.equal(
      requests.some((request) => request.method !== 'GET'),
      false,
    );
    assert.equal(view.queryByText(/pagamento confirmado/i), null);
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.click(view.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() => assert.ok(view.getByLabelText('Código Pix copia e cola')));
    assert.equal(
      (view.getByLabelText('Código Pix copia e cola') as HTMLTextAreaElement).value,
      'synthetic-pix-code',
    );
    assert.equal(view.queryByText(/pagamento confirmado/i), null);
    assert.equal(
      requests.filter((request) => request.url.endsWith('/payments') && request.method === 'POST')
        .length,
      1,
    );
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
  window.bpSop_silentOrderPost = (options) =>
    options.onSuccess({ PaymentToken: '11111111-1111-4111-8111-111111111111' });
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZX91K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-19',
            checkOut: '2026-11-22',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 101600,
            candidateBalanceCents: 101600,
            balanceStatus: 'unrecorded_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix', 'card'],
            cardInstallments: [1, 2, 3, 4, 5, 6],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZX91K/checkout'))
      return new Response(
        JSON.stringify({
          success: true,
          resume: {
            reference,
            token,
            path: `/checkout/${reference}`,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          order: {
            publicReference: reference,
            status: 'pre_reservado',
            paymentStatus: null,
            quoteTotal: '1016.00',
          },
          payment: { enabled: true, provider: 'cielo_sandbox' },
        }),
        { status: 201 },
      );
    if (url.endsWith('/payments/cielo-sop-token'))
      return new Response(
        JSON.stringify({
          success: true,
          environment: 'sandbox',
          accessToken: 'synthetic-sop-access-token',
        }),
        { status: 200 },
      );
    if (url.endsWith('/payments'))
      return new Response(
        JSON.stringify({
          success: true,
          code: 'rejected',
          message: 'Não aprovado',
          replayed: false,
          payment: {
            status: 'rejected',
            method: 'card',
            amount: '1239.03',
            baseAmount: '1016.00',
            currency: 'BRL',
            expiresAt: null,
            paidAt: null,
            pix: null,
          },
        }),
        { status: 201 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.click(view.getByLabelText('Cartão em até 6x'));
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText('Número do cartão'), {
      target: { value: '4111111111111111' },
    });
    fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
    fireEvent.change(view.getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(view.getByLabelText('Nome no cartão'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail do titular'), {
      target: { value: 'cliente@example.test' },
    });
    fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular do cartão'), {
      target: { value: '52998224725' },
    });
    fireEvent.click(view.getByRole('button', { name: /^Parcelamento/ }));
    fireEvent.click(view.getByRole('option', { name: /^6x/ }));
    assert.match(
      view.getByRole('button', { name: /confirmar e pagar/i }).textContent ?? '',
      /6x de até R\$\s*206,51/,
    );
    assert.match(
      view.getByRole('button', { name: /^Parcelamento/ }).parentElement?.parentElement
        ?.textContent ?? '',
      /1\.239,03/,
    );
    assert.equal(
      calls.some((call) => call.init?.method === 'POST'),
      false,
    );
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.ok(calls.some((call) => call.url.endsWith('/payments'))));
    const createCall = calls.find((call) =>
      call.url.endsWith('/existing-reservations/ZX91K/checkout'),
    );
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
  const summaryRequests: string[] = [];
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    if (url.includes('/checkout-summary')) summaryRequests.push(url);
    return new Response('{}', { status: 503 });
  };
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByRole('alert')));
    const support = view.getByRole('link', { name: /whatsapp/i }) as HTMLAnchorElement;
    const message = new URL(support.href).searchParams.get('text')!;
    assert.ok(message.includes('ZX91K'));
    assert.equal(message.includes('Como quero pagar'), false);
    await waitFor(() => assert.equal(summaryRequests.length, 1));
    fireEvent.click(view.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => assert.equal(summaryRequests.length, 2));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

for (const [code, message] of [
  [
    'existing_checkout_already_started',
    /pagamento anterior que ainda não foi encerrado com segurança/,
  ],
  ['existing_receivable_unconfirmed', /registro desta reserva está em conferência/],
] as const) {
  test(`checkout ${code} prevents another payment and explains how to proceed`, async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/recovery-credential')) {
        return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
      }
      if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/checkout-summary'))
        return new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZX91K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-19',
              checkOut: '2026-11-22',
              guests: 4,
              adults: 4,
              children: 0,
              infants: 0,
              totalCents: 101600,
              candidateBalanceCents: 101600,
              balanceStatus: 'unrecorded_candidate',
              paymentEnabled: true,
              paymentMethods: ['pix'],
              cardInstallments: [],
            },
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ success: false, code }), {
        status: code === 'existing_checkout_already_started' ? 409 : 503,
      });
    };
    try {
      window.history.replaceState(null, '', '/checkout/ZX91K');
      const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
      await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
      fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
        target: { value: '52998224725' },
      });
      fireEvent.change(view.getByLabelText('Nome completo'), {
        target: { value: 'Cliente Exemplo' },
      });
      fireEvent.change(view.getByLabelText('E-mail'), {
        target: { value: 'cliente@example.test' },
      });
      fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
      fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
        target: { value: '52998224725' },
      });
      fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
      fireEvent.click(view.getByRole('button', { name: /gerar qr code pix/i }));
      await waitFor(() => assert.match(view.getByRole('alert').textContent ?? '', message));
      assert.equal(
        (view.getByRole('button', { name: /gerar qr code pix/i }) as HTMLButtonElement).disabled,
        true,
      );
      assert.ok(view.getByRole('link', { name: /whatsapp/i }));
      assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
      assert.equal(
        calls.some((call) => call.url.endsWith('/payments')),
        false,
      );
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
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    calls.push(url);
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZX91K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2030-11-19',
            checkOut: '2030-11-22',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 101600,
            candidateBalanceCents: 101600,
            balanceStatus: 'unrecorded_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZX91K/checkout')) {
      keys.push((init?.headers as Record<string, string>)['Idempotency-Key']);
      if (keys.length === 1) throw new TypeError('synthetic network failure');
      return new Response(
        JSON.stringify({ success: false, code: 'existing_receivable_unconfirmed' }),
        { status: 503 },
      );
    }
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZX91K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZX91K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.click(view.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() =>
      assert.match(view.getByRole('alert').textContent ?? '', /sem alterar os dados/),
    );
    fireEvent.click(view.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() =>
      assert.match(
        view.getByRole('alert').textContent ?? '',
        /registro desta reserva está em conferência/,
      ),
    );
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(
      calls.some((url) => url.endsWith('/payments')),
      false,
    );
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
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 19750,
            balanceStatus: 'pending_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix', 'card'],
            cardInstallments: [1, 2, 3, 4, 5, 6],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZY92K/checkout'))
      return new Response(
        JSON.stringify({
          success: true,
          resume: {
            reference,
            token,
            path: `/checkout/${reference}`,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          order: {
            publicReference: reference,
            status: 'pre_reservado',
            paymentStatus: null,
            quoteTotal: '197.50',
          },
          payment: { enabled: true, provider: 'cielo_sandbox' },
        }),
        { status: 201 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.click(view.getByLabelText('Cartão em até 6x'));
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText('Número do cartão'), {
      target: { value: '4111111111111111' },
    });
    fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
    fireEvent.change(view.getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(view.getByLabelText('Nome no cartão'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail do titular'), {
      target: { value: 'cliente@example.test' },
    });
    fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular do cartão'), {
      target: { value: '52998224725' },
    });
    fireEvent.click(view.getByRole('button', { name: /^Parcelamento/ }));
    fireEvent.click(view.getByRole('option', { name: /^6x/ }));
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() =>
      assert.ok(view.getByText(/forma de pagamento e as parcelas foram reservadas/)),
    );
    assert.equal(
      (view.getByRole('button', { name: /^Parcelamento/ }) as HTMLButtonElement).disabled,
      true,
    );
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
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 19750,
            balanceStatus: 'pending_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZY92K/checkout'))
      return new Response(
        JSON.stringify({
          success: true,
          resume: {
            reference,
            token,
            path: `/checkout/${reference}`,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          order: {
            publicReference: reference,
            status: 'pre_reservado',
            paymentStatus: null,
            quoteTotal: '197.50',
          },
          payment: { enabled: true, provider: 'cielo_sandbox' },
        }),
        { status: 201 },
      );
    if (url.endsWith('/payments'))
      return new Response(
        JSON.stringify({
          success: true,
          code: 'created',
          message: 'Aguardando',
          replayed: false,
          payment: {
            status: 'pending',
            method: 'pix',
            amount: '197.50',
            currency: 'BRL',
            expiresAt: null,
            paidAt: null,
            pix: { copyPaste: 'synthetic-pix-code', qrCodeBase64: 'c3ludGhldGlj' },
          },
        }),
        { status: 201 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(
      null,
      '',
      '/checkout/ZY92K?utm_source=google&gclid=synthetic-click&token=not-a-credential',
    );
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.click(view.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() => assert.ok(calls.some((call) => call.url.endsWith('/payments'))));
    const paymentCall = calls.find((call) => call.url.endsWith('/payments'));
    const initialOrderCall = calls.find((call) =>
      call.url.endsWith('/existing-reservations/ZY92K/checkout'),
    );
    assert.equal(
      (paymentCall?.init?.headers as Record<string, string>)['X-Checkout-Resume-Token'],
      token,
    );
    assert.equal(window.location.pathname, `/checkout/${reference}`);
    assert.equal(window.location.href.includes(token), false);
    assert.equal(new URLSearchParams(window.location.search).get('utm_source'), 'google');
    assert.equal(new URLSearchParams(window.location.search).get('gclid'), 'synthetic-click');
    assert.equal(new URLSearchParams(window.location.search).has('token'), false);
    assert.deepEqual(JSON.parse(String(initialOrderCall?.init?.body)).acceptedContract, {
      version: '2026-11-18.1',
      contentHash: 'a'.repeat(64),
    });
    const body = JSON.parse(String(paymentCall?.init?.body));
    assert.equal(body.paymentMethod, 'pix');
    assert.equal(body.payerIdentification.number, '52998224725');
    cleanup();
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const reopened = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    const link = reopened.getByRole('link', { name: 'Acompanhar pagamento' }) as HTMLAnchorElement;
    assert.equal(new URL(link.href).pathname, `/checkout/${reference}`);
    assert.equal(link.href.includes(token), false);
    await waitFor(() => assert.ok(reopened.getByText('Apartamento Exemplo')));
    assert.equal(reopened.queryByRole('button', { name: /gerar qr code pix/i }), null);
    cleanup();
    window.history.replaceState(null, '', `/checkout/ZY92K?retry=1&renewal=${reference}`);
    const retryView = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(retryView.getByLabelText('Nome completo')));
    assert.ok(retryView.getByRole('button', { name: /gerar qr code pix/i }));
    fireEvent.change(retryView.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(retryView.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(retryView.getByLabelText('E-mail'), {
      target: { value: 'cliente@example.test' },
    });
    fireEvent.change(retryView.getByLabelText('Telefone'), {
      target: { value: '64999999999' },
    });
    fireEvent.change(retryView.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(retryView.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.click(retryView.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() =>
      assert.ok(
        calls.filter((call) => call.url.endsWith('/existing-reservations/ZY92K/checkout')).length >
          1,
      ),
    );
    const checkoutCalls = calls.filter((call) =>
      call.url.endsWith('/existing-reservations/ZY92K/checkout'),
    );
    const initialKey = (initialOrderCall?.init?.headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    const renewalKey = (checkoutCalls[1].init?.headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    assert.ok(initialKey);
    assert.ok(renewalKey);
    assert.notEqual(renewalKey, initialKey);

    cleanup();
    const nextOrderReference = 'D'.repeat(40);
    window.history.replaceState(null, '', `/checkout/ZY92K?retry=1&renewal=${nextOrderReference}`);
    const secondRenewalView = render(
      React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }),
    );
    await waitFor(() => assert.ok(secondRenewalView.getByLabelText('Nome completo')));
    fireEvent.change(secondRenewalView.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(secondRenewalView.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(secondRenewalView.getByLabelText('E-mail'), {
      target: { value: 'cliente@example.test' },
    });
    fireEvent.change(secondRenewalView.getByLabelText('Telefone'), {
      target: { value: '64999999999' },
    });
    fireEvent.change(secondRenewalView.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(secondRenewalView.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.click(secondRenewalView.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() =>
      assert.ok(
        calls.filter((call) => call.url.endsWith('/existing-reservations/ZY92K/checkout')).length >
          2,
      ),
    );
    const allCheckoutCalls = calls.filter((call) =>
      call.url.endsWith('/existing-reservations/ZY92K/checkout'),
    );
    const secondRenewalKey = (allCheckoutCalls[2].init?.headers as Record<string, string>)[
      'Idempotency-Key'
    ];
    assert.notEqual(secondRenewalKey, renewalKey);
    assert.ok(calls.filter((call) => call.url.includes('/checkout-summary')).length >= 3);
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
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    calls.push(url);
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 19750,
            balanceStatus: 'pending_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZY92K/checkout'))
      return new Response(
        JSON.stringify({
          success: true,
          resume: {
            reference,
            token,
            path: `/checkout/${reference}`,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          order: {
            publicReference: reference,
            status: 'pre_reservado',
            paymentStatus: null,
            quoteTotal: '197.50',
          },
          payment: { enabled: false, provider: 'cielo_sandbox' },
        }),
        { status: 201 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText(/CPF ou CNPJ de quem vai pagar o Pix/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
    fireEvent.click(view.getByRole('button', { name: /gerar qr code pix/i }));
    await waitFor(() =>
      assert.ok(view.getByRole('heading', { name: /não foi possível consultar agora/i })),
    );
    assert.equal(
      calls.some((url) => url.endsWith('/payments')),
      false,
    );
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
  window.bpSop_silentOrderPost = (options) =>
    options.onSuccess({ PaymentToken: '11111111-1111-4111-8111-111111111111' });
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/recovery-credential')) {
      return new Response(JSON.stringify({ credential: 'a'.repeat(144) }), { status: 200 });
    }
    if (String(input).endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 4,
            adults: 4,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 19750,
            balanceStatus: 'pending_candidate',
            paymentEnabled: true,
            paymentMethods: ['card'],
            cardInstallments: [6],
          },
        }),
        { status: 200 },
      );
    if (url.endsWith('/existing-reservations/ZY92K/checkout'))
      return new Response(
        JSON.stringify({
          success: true,
          resume: {
            reference,
            token,
            path: `/checkout/${reference}`,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
          order: {
            publicReference: reference,
            status: 'pre_reservado',
            paymentStatus: null,
            quoteTotal: '197.50',
          },
          payment: { enabled: true, provider: 'cielo_sandbox' },
        }),
        { status: 201 },
      );
    if (url.endsWith('/payments/cielo-sop-token'))
      return new Response(
        JSON.stringify({
          success: true,
          environment: 'sandbox',
          accessToken: 'synthetic-sop-access-token',
        }),
        { status: 200 },
      );
    if (url.endsWith('/payments'))
      return new Response(
        JSON.stringify({
          success: true,
          code: 'approved',
          message: 'Aprovado',
          replayed: false,
          payment: {
            status: 'approved',
            method: 'card',
            amount: '240.86',
            baseAmount: '197.50',
            currency: 'BRL',
            expiresAt: null,
            paidAt: null,
            pix: null,
          },
        }),
        { status: 201 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByLabelText('Nome completo')));
    fireEvent.change(view.getByLabelText('CPF do titular da reserva'), {
      target: { value: '52998224725' },
    });
    fireEvent.change(view.getByLabelText('Nome completo'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail'), { target: { value: 'cliente@example.test' } });
    fireEvent.change(view.getByLabelText('Telefone'), { target: { value: '64999999999' } });
    fireEvent.change(view.getByLabelText('Número do cartão'), { target: { value: syntheticCard } });
    fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
    fireEvent.change(view.getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(view.getByLabelText('Nome no cartão'), {
      target: { value: 'Cliente Exemplo' },
    });
    fireEvent.change(view.getByLabelText('E-mail do titular'), {
      target: { value: 'cliente@example.test' },
    });
    fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular do cartão'), {
      target: { value: '52998224725' },
    });
    assert.match(view.getByRole('button', { name: /^Parcelamento/ }).textContent ?? '', /^6x/);
    fireEvent.click(view.getByRole('button', { name: /^Parcelamento/ }));
    assert.equal(view.getAllByRole('option').length, 1);
    fireEvent.click(view.getByRole('option', { name: /^6x/ }));
    fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito as condições/ }));
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

test('a server-authorized deposit shows Pix and requires a valid reservation holder CPF', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZY92K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-13',
              checkOut: '2026-11-16',
              guests: 2,
              adults: 2,
              children: 0,
              infants: 0,
              totalCents: 39500,
              candidateBalanceCents: 19750,
              balanceStatus: 'pending_candidate',
              paymentEnabled: false,
              paymentMethods: [],
              cardInstallments: [],
              outstandingBalanceCents: 39500,
              paymentPlans: {
                full: { methods: [], amountCents: null },
                deposit: { methods: ['pix'], amountCents: 19750 },
              },
            },
          }),
          { status: 200 },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByText('Entrada de 50%')));
    assert.equal(view.queryByLabelText(/Cartão em/), null);
    assert.ok(view.getByText(/saldo restante.*até um dia antes do check-in/i));
    const cpf = view.getByLabelText('CPF do titular da reserva') as HTMLInputElement;
    fireEvent.change(cpf, { target: { value: '12345678901' } });
    assert.equal(cpf.checkValidity(), false);
    fireEvent.change(cpf, { target: { value: '52998224725' } });
    assert.equal(cpf.checkValidity(), true);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('shows distinct server amounts for full and deposit plans', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZY92K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-13',
              checkOut: '2026-11-16',
              guests: 2,
              adults: 2,
              children: 0,
              infants: 0,
              totalCents: 39500,
              candidateBalanceCents: 39500,
              outstandingBalanceCents: 39500,
              balanceStatus: 'unrecorded_candidate',
              paymentEnabled: true,
              paymentMethods: ['pix', 'card'],
              cardInstallments: [1],
              paymentPlans: {
                full: { methods: ['pix', 'card'], amountCents: 39500 },
                deposit: { methods: ['pix'], amountCents: 19750 },
              },
            },
          }),
          { status: 200 },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByText(/Entrada de 50%/i)));
    const deposit = view.getByRole('radio', { name: /Entrada de 50%/i });
    fireEvent.click(deposit);
    assert.ok(view.getByRole('button', { name: /Gerar QR Code Pix.*197,50/i }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('reopening after a deposit offers only the remaining balance', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: {
              code: 'ZY92K',
              listingId: 'LISTING',
              property: 'Apartamento Exemplo',
              image: null,
              checkIn: '2026-11-13',
              checkOut: '2026-11-16',
              guests: 2,
              adults: 2,
              children: 0,
              infants: 0,
              totalCents: 39500,
              candidateBalanceCents: 19750,
              outstandingBalanceCents: 19750,
              balanceStatus: 'pending_candidate',
              paymentEnabled: true,
              paymentMethods: ['pix'],
              cardInstallments: [],
              paymentPlans: {
                full: { methods: ['pix'], amountCents: 19750 },
                deposit: { methods: [], amountCents: null },
              },
            },
          }),
          { status: 200 },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByText('Quitar saldo restante agora')));
    assert.ok(view.getByRole('button', { name: /Gerar QR Code Pix.*197,50/ }));
    assert.equal(view.queryByText('Entrada de 50%'), null);
    assert.equal(view.queryByText('Pagar 100% do saldo agora'), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('same-browser checkout resumes after the deposit was reconciled and offers only the balance', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'R'.repeat(40);
  const token = 'T'.repeat(64);
  const calls: string[] = [];
  saveCheckoutResumeToken(reference, token, '2099-01-01T00:00:00Z');
  saveExistingReservationResumeReference('ZY92K', reference);
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    if (url.endsWith(`/api/checkout/${reference}`))
      return new Response(
        JSON.stringify({
          success: true,
          order: {
            status: 'entrada_conciliada',
            origin: 'stays_existing',
            publicReference: reference,
            reservationConfirmed: true,
            listingId: 'LISTING',
            guestName: 'Cliente Exemplo',
            from: '2026-11-13',
            to: '2026-11-16',
            quoteTotal: '197.50',
            currency: 'BRL',
            paymentStatus: 'approved',
            expiresAt: '2099-01-01T00:00:00Z',
            createdAt: '2026-11-20T12:00:00Z',
            existingDepositReviewRequired: false,
          },
          confirmation: null,
          payment: {
            enabled: false,
            methods: [],
            publicKey: null,
            provider: 'cielo_sandbox',
            attempt: {
              status: 'approved',
              method: 'pix',
              amount: '197.50',
              currency: 'BRL',
              expiresAt: null,
              paidAt: '2026-11-20T12:00:00Z',
              pix: { copyPaste: null, qrCodeBase64: null },
            },
          },
        }),
        { status: 200 },
      );
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 2,
            adults: 2,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 19750,
            outstandingBalanceCents: 19750,
            balanceStatus: 'unrecorded_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
            paymentPlans: {
              full: { methods: ['pix'], amountCents: 19750 },
              deposit: { methods: [], amountCents: null },
            },
          },
        }),
        { status: 200 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() =>
      assert.ok(view.getByRole('button', { name: /Gerar QR Code Pix.*197,50/i })),
    );
    assert.ok(view.getByText('Quitar saldo restante agora'));
    assert.equal(view.queryByText('Entrada de 50%'), null);
    assert.equal(view.queryByRole('link', { name: 'Acompanhar pagamento' }), null);
    assert.equal(window.sessionStorage.getItem('crcn.existing-reservation.resume.ZY92K'), null);
    assert.equal(getCheckoutResumeToken(reference), token);
    assert.ok(calls.some((url) => url.endsWith(`/api/checkout/${reference}`)));
    await waitFor(() => assert.ok(calls.filter((url) => url.includes('/checkout-summary')).length >= 2));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('same-browser checkout stays blocked when deposit review status is missing', async () => {
  const originalFetch = globalThis.fetch;
  const reference = 'S'.repeat(40);
  const token = 'V'.repeat(64);
  saveCheckoutResumeToken(reference, token, '2099-01-01T00:00:00Z');
  saveExistingReservationResumeReference('ZY92K', reference);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/public/legal-pages/contrato')) return contractResponse();
    if (url.endsWith(`/api/checkout/${reference}`))
      return new Response(
        JSON.stringify({
          success: true,
          order: {
            status: 'entrada_conciliada',
            origin: 'stays_existing',
            publicReference: reference,
            reservationConfirmed: true,
            listingId: 'LISTING',
            guestName: 'Cliente Exemplo',
            from: '2026-11-13',
            to: '2026-11-16',
            quoteTotal: '197.50',
            currency: 'BRL',
            paymentStatus: 'approved',
            expiresAt: '2099-01-01T00:00:00Z',
            createdAt: '2026-11-20T12:00:00Z',
          },
          confirmation: null,
          payment: {
            enabled: false,
            methods: [],
            publicKey: null,
            provider: 'cielo_sandbox',
            attempt: {
              status: 'approved',
              method: 'pix',
              amount: '197.50',
              currency: 'BRL',
              expiresAt: null,
              paidAt: '2026-11-20T12:00:00Z',
              pix: { copyPaste: null, qrCodeBase64: null },
            },
          },
        }),
        { status: 200 },
      );
    if (url.includes('/checkout-summary'))
      return new Response(
        JSON.stringify({
          success: true,
          reservation: {
            code: 'ZY92K',
            listingId: 'LISTING',
            property: 'Apartamento Exemplo',
            image: null,
            checkIn: '2026-11-13',
            checkOut: '2026-11-16',
            guests: 2,
            adults: 2,
            children: 0,
            infants: 0,
            totalCents: 39500,
            candidateBalanceCents: 19750,
            outstandingBalanceCents: 19750,
            balanceStatus: 'unrecorded_candidate',
            paymentEnabled: true,
            paymentMethods: ['pix'],
            cardInstallments: [],
            paymentPlans: {
              full: { methods: ['pix'], amountCents: 19750 },
              deposit: { methods: [], amountCents: null },
            },
          },
        }),
        { status: 200 },
      );
    return new Response('{}', { status: 503 });
  };
  try {
    window.history.replaceState(null, '', '/checkout/ZY92K');
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() => assert.ok(view.getByRole('link', { name: 'Acompanhar pagamento' })));
    assert.equal(view.queryByRole('button', { name: /Gerar QR Code Pix/ }), null);
    assert.equal(
      window.sessionStorage.getItem('crcn.existing-reservation.resume.ZY92K'),
      reference,
    );
    assert.equal(getCheckoutResumeToken(reference), token);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test('fully paid reservation shows only confirmation and generic WhatsApp support', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/public/legal-pages/contrato')
      ? contractResponse()
      : new Response(
          JSON.stringify({
            success: true,
            reservation: { code: 'ZY92K', state: 'completed' },
          }),
          { status: 200 },
        );
  try {
    const view = render(React.createElement(ExistingReservationCheckout, { code: 'ZY92K', accessToken: 'test-access-token' }));
    await waitFor(() =>
      assert.ok(view.getByRole('heading', { name: 'Sua reserva está confirmada e 100% paga' })),
    );
    assert.equal(view.queryByText('Confirme e pague'), null);
    assert.equal(view.queryByText('ZY92K'), null);
    assert.equal(view.queryByText('Sua hospedagem'), null);
    assert.equal(view.queryByText('Resumo do pagamento'), null);
    const support = view.getByRole('link', { name: /Falar no WhatsApp/ });
    const supportUrl = new URL(support.getAttribute('href')!);
    assert.equal(supportUrl.pathname, '/5564992946675');
    assert.match(supportUrl.searchParams.get('text') ?? '', /reserva já confirmada/i);
    assert.doesNotMatch(supportUrl.search, /ZY92K|LISTING|2026-11/);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
