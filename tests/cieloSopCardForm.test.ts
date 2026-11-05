import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { checkoutApi } from '../src/services/checkoutApi.ts';
import type { CieloSopOptions } from '../src/services/cieloSopSdk.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(dom.window, {
  requestAnimationFrame: (callback: (timestamp: number) => void) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
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
const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { CieloSopCardForm } = await import('../src/components/booking/CieloSopCardForm.tsx');
const { formatBrazilianDocument, formatBrazilianPhone, formatCardExpiration, formatCardNumber } =
  await import('../src/utils/checkoutInputFormatting.ts');

function submitCardForm(form: HTMLFormElement) {
  const expiry = form.querySelector<HTMLInputElement>('.bp-sop-cardexpirationdate');
  if (expiry && !expiry.value) fireEvent.change(expiry, { target: { value: '1230' } });
  return fireEvent.submit(form);
}

afterEach(() => {
  cleanup();
  delete window.bpSop_silentOrderPost;
});

test('checkout input masks format and preserve CPF, CNPJ, phone and card expiration digits', () => {
  assert.equal(formatBrazilianDocument('12345678909'), '123.456.789-09');
  assert.equal(formatBrazilianDocument('12345678000199'), '12.345.678/0001-99');
  assert.equal(formatBrazilianDocument('1234'), '123.4');
  assert.equal(formatBrazilianPhone('64999999999'), '(64) 99999-9999');
  assert.equal(formatBrazilianPhone('6433334444'), '(64) 3333-4444');
  assert.equal(formatCardExpiration('1230'), '12/30');
  assert.equal(formatCardExpiration('12/2030'), '12/30');
  assert.equal(formatCardNumber('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(formatCardExpiration('1230'), '12/30');
});

test('a R$ 2 booking clearly disables card while normal amounts offer installments', () => {
  const view = render(
    React.createElement(CieloSopCardForm, {
      reference: 'E'.repeat(40),
      amount: '2.00',
      credentials: null,
      onAttemptFinished: () => {},
      preparePayment: async () => {
        throw new Error('must not submit');
      },
    }),
  );
  assert.match(view.getByText(/parcela mínima no cartão/).textContent ?? '', /R\$ 5,00/);
  assert.equal((view.getByLabelText(/Parcelamento/) as HTMLSelectElement).disabled, true);
  assert.equal(
    (view.getByRole('button', { name: /Pagar com cartão/ }) as HTMLButtonElement).disabled,
    true,
  );
  view.rerender(
    React.createElement(CieloSopCardForm, {
      reference: 'E'.repeat(40),
      amount: '850.00',
      credentials: null,
      onAttemptFinished: () => {},
      preparePayment: async () => {
        throw new Error('must not submit');
      },
    }),
  );
  const select = view.getByLabelText(/Parcelamento/) as HTMLSelectElement;
  assert.equal(select.disabled, false);
  assert.equal(select.options.length, 6);
  fireEvent.change(select, { target: { value: '6' } });
  assert.equal(select.value, '6');
  fireEvent.change(view.getByLabelText('Validade (MM/AA)'), { target: { value: '1230' } });
  assert.equal((view.getByLabelText('Validade (MM/AA)') as HTMLInputElement).value, '12/30');
  fireEvent.change(view.getByLabelText('CPF ou CNPJ do titular'), {
    target: { value: '12345678909' },
  });
  assert.equal(
    (view.getByLabelText('CPF ou CNPJ do titular') as HTMLInputElement).value,
    '123.456.789-09',
  );
});

test('the card form uses the environment supplied by the backend without hardcoding sandbox', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  const captured = { options: null as CieloSopOptions | null };
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'production',
    accessToken: 'production-browser-fixture',
  });
  window.bpSop_silentOrderPost = (options) => {
    captured.options = options;
  };
  try {
    const { container, getByLabelText, getByRole } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'P'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'T'.repeat(64) },
        onAttemptFinished: () => {},
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );
    fireEvent.change(getByLabelText('Nome no cartão'), { target: { value: 'Sandbox Guest' } });
    fireEvent.change(getByLabelText('E-mail do titular'), {
      target: { value: 'guest@example.test' },
    });
    fireEvent.change(getByLabelText('CPF ou CNPJ do titular'), {
      target: { value: '12345678909' },
    });
    submitCardForm(container.querySelector('form')!);
    assert.equal(captured.options?.environment, 'production');
    assert.equal(captured.options?.accessToken, 'production-browser-fixture');
    assert.equal(captured.options?.enableTokenize, false);
    assert.equal(container.textContent?.includes('ambiente de testes Cielo'), false);
    captured.options?.onInvalid([]);
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
  }
});

test('Cielo tokenization sends only the temporary token and cardholder data to the backend', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  const originalCreatePayment = checkoutApi.createCheckoutPayment;
  const capturedSop = { options: null as CieloSopOptions | null };
  let cieloInputs: { card: string; expiry: string } | null = null;
  let submitted: unknown[] | null = null;
  let finished = 0;
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'sandbox',
    accessToken: 'browser-access-token-sentinel',
  });
  checkoutApi.createCheckoutPayment = async (...args) => {
    submitted = args;
    return {
      kind: 'response',
      success: true,
      code: 'approved',
      message: 'Pagamento recebido.',
      replayed: false,
      payment: null,
    };
  };
  window.bpSop_silentOrderPost = (options) => {
    capturedSop.options = options;
    cieloInputs = {
      card: document.querySelector<HTMLInputElement>('.bp-sop-cardnumber')?.value ?? '',
      expiry: document.querySelector<HTMLInputElement>('.bp-sop-cardexpirationdate')?.value ?? '',
    };
  };

  try {
    const { container, getByLabelText, getByRole } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'R'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'T'.repeat(64) },
        onAttemptFinished: () => {
          finished += 1;
        },
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );

    fireEvent.change(getByLabelText('Número do cartão'), { target: { value: '4111111111111111' } });
    fireEvent.change(getByLabelText('Código de segurança'), { target: { value: '123' } });
    assert.equal(container.querySelector<HTMLInputElement>('.bp-sop-cardcvv')?.value, '123');
    fireEvent.change(getByLabelText('Nome no cartão'), { target: { value: ' Synthetic Guest ' } });
    fireEvent.change(getByLabelText('E-mail do titular'), {
      target: { value: 'guest@example.test' },
    });
    fireEvent.change(getByLabelText('CPF ou CNPJ do titular'), {
      target: { value: '123.456.789-01' },
    });
    fireEvent.change(getByLabelText(/^Parcelamento/), { target: { value: '6' } });
    submitCardForm(container.querySelector('form')!);

    assert.equal(capturedSop.options?.environment, 'sandbox');
    assert.deepEqual(cieloInputs, { card: '4111111111111111', expiry: '12/2030' });
    assert.equal(
      (getByLabelText('Número do cartão') as HTMLInputElement).value,
      '4111 1111 1111 1111',
    );
    assert.equal(capturedSop.options?.language, 'pt');
    assert.equal(capturedSop.options?.enableTokenize, false);
    assert.equal(capturedSop.options?.accessToken, 'browser-access-token-sentinel');
    capturedSop.options?.onSuccess({ PaymentToken: '123e4567-e89b-12d3-a456-426614174000' });

    await waitFor(() => assert.ok(submitted));
    assert.equal(submitted?.[0], 'R'.repeat(40));
    assert.deepEqual(submitted?.[1], { type: 'resume-token', resumeToken: 'T'.repeat(64) });
    assert.equal(submitted?.[2], '1036.59');
    const payload = submitted?.[3] as Record<string, unknown>;
    assert.deepEqual(
      {
        paymentMethod: payload.paymentMethod,
        paymentMethodId: payload.paymentMethodId,
        token: payload.token,
        installments: payload.installments,
        cardholderName: payload.cardholderName,
        cardholderEmail: payload.cardholderEmail,
        payerIdentification: payload.payerIdentification,
      },
      {
        paymentMethod: 'card',
        paymentMethodId: 'cielo_credit_card',
        token: '123e4567-e89b-12d3-a456-426614174000',
        installments: 6,
        cardholderName: 'Synthetic Guest',
        cardholderEmail: 'guest@example.test',
        payerIdentification: { type: 'CPF', number: '12345678901' },
      },
    );
    assert.match(String(payload.idempotencyKey), /^[0-9a-f-]{36}$/i);
    const serializedRequest = JSON.stringify(submitted);
    assert.equal(serializedRequest.includes('4111111111111111'), false);
    assert.equal(serializedRequest.includes('123"'), false);
    await waitFor(() => assert.equal(finished, 1));
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
    checkoutApi.createCheckoutPayment = originalCreatePayment;
  }
});

test('pending submission blocks duplicate tokenization and backend errors allow a retry', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  const originalCreatePayment = checkoutApi.createCheckoutPayment;
  const capturedSop = { options: null as CieloSopOptions | null };
  let sopCalls = 0;
  let finishPayment:
    ((value: Awaited<ReturnType<typeof checkoutApi.createCheckoutPayment>>) => void) | undefined;
  let paymentCalls = 0;
  let finished = 0;
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'sandbox',
    accessToken: 'token-sentinel',
  });
  checkoutApi.createCheckoutPayment = () => {
    paymentCalls += 1;
    if (paymentCalls === 1)
      return new Promise((resolve) => {
        finishPayment = resolve;
      });
    return Promise.resolve({
      kind: 'response',
      success: false,
      code: 'gateway_result_unknown',
      message: 'O resultado será conciliado.',
      replayed: false,
      payment: null,
    });
  };
  window.bpSop_silentOrderPost = (options) => {
    capturedSop.options = options;
    sopCalls += 1;
  };

  try {
    const { container, getByLabelText, getByRole, findByRole } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'S'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'V'.repeat(64) },
        onAttemptFinished: () => {
          finished += 1;
        },
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );
    fireEvent.change(getByLabelText('Nome no cartão'), { target: { value: 'Guest' } });
    fireEvent.change(getByLabelText('E-mail do titular'), {
      target: { value: 'guest@example.test' },
    });
    fireEvent.change(getByLabelText('CPF ou CNPJ do titular'), {
      target: { value: '12345678901' },
    });

    const form = container.querySelector('form')!;
    submitCardForm(form);
    submitCardForm(form);
    assert.ok(capturedSop.options);
    assert.equal(sopCalls, 1);
    assert.equal(
      getByRole('button', { name: 'Enviando pagamento…' }).hasAttribute('disabled'),
      true,
    );
    submitCardForm(form);
    assert.equal(sopCalls, 1);
    capturedSop.options?.onSuccess({ PaymentToken: '123e4567-e89b-12d3-a456-426614174001' });

    await waitFor(() => assert.ok(finishPayment));
    assert.equal(
      getByRole('button', { name: 'Enviando pagamento…' }).hasAttribute('disabled'),
      true,
    );
    finishPayment?.({
      kind: 'response',
      success: false,
      code: 'gateway_result_unknown',
      message: 'O resultado será conciliado.',
      replayed: false,
      payment: null,
    });
    assert.ok(await findByRole('alert'));
    await waitFor(() => assert.equal(finished, 1));
    assert.equal(
      getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
      false,
    );

    submitCardForm(form);
    await waitFor(() => assert.equal(sopCalls, 2));
    capturedSop.options?.onSuccess({ PaymentToken: '123e4567-e89b-12d3-a456-426614174002' });
    await waitFor(() => assert.equal(finished, 2));
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
    checkoutApi.createCheckoutPayment = originalCreatePayment;
  }
});

test('synchronous SOP errors restore the form and present a retryable error', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'sandbox',
    accessToken: 'token-sentinel',
  });
  window.bpSop_silentOrderPost = () => {
    throw new Error('synthetic SOP failure');
  };

  try {
    const { container, getByRole, findByRole } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'T'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'X'.repeat(64) },
        onAttemptFinished: () => {},
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );

    assert.doesNotThrow(() => submitCardForm(container.querySelector('form')!));
    assert.match((await findByRole('alert')).textContent ?? '', /validação segura do cartão/);
    assert.equal(
      getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
      false,
    );
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
  }
});

test('tokenization timeout unlocks the form and lets the guest retry', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  const originalWindowSetTimeout = window.setTimeout;
  const timeout = { callback: null as (() => void) | null };
  let sopCalls = 0;
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'sandbox',
    accessToken: 'token-sentinel',
  });
  window.setTimeout = ((callback: () => void, delay?: number) => {
    if (delay === 30_000) {
      timeout.callback = callback;
      return 77;
    }
    return originalWindowSetTimeout(callback, delay);
  }) as typeof window.setTimeout;
  window.bpSop_silentOrderPost = () => {
    sopCalls += 1;
  };

  try {
    const { container, getByRole, findByRole } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'M'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'Z'.repeat(64) },
        onAttemptFinished: () => {},
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );

    submitCardForm(container.querySelector('form')!);
    assert.equal(
      getByRole('button', { name: 'Enviando pagamento…' }).hasAttribute('disabled'),
      true,
    );
    timeout.callback?.();
    assert.match((await findByRole('alert')).textContent ?? '', /demorou mais que o esperado/);
    assert.equal(
      getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
      false,
    );

    submitCardForm(container.querySelector('form')!);
    assert.equal(sopCalls, 2);
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
    window.setTimeout = originalWindowSetTimeout;
  }
});

test('late tokenization callbacks after unmount do not initiate a payment', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  const originalCreatePayment = checkoutApi.createCheckoutPayment;
  const capturedSop = { options: null as CieloSopOptions | null };
  let paymentCalls = 0;
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'sandbox',
    accessToken: 'token-sentinel',
  });
  checkoutApi.createCheckoutPayment = async () => {
    paymentCalls += 1;
    return { kind: 'unavailable' };
  };
  window.bpSop_silentOrderPost = (next) => {
    capturedSop.options = next;
  };

  try {
    const { container, getByLabelText, getByRole, unmount } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'U'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'Y'.repeat(64) },
        onAttemptFinished: () => {},
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );
    fireEvent.change(getByLabelText('Nome no cartão'), { target: { value: 'Guest' } });
    fireEvent.change(getByLabelText('E-mail do titular'), {
      target: { value: 'guest@example.test' },
    });
    fireEvent.change(getByLabelText('CPF ou CNPJ do titular'), {
      target: { value: '12345678901' },
    });
    submitCardForm(container.querySelector('form')!);
    unmount();

    capturedSop.options?.onSuccess({ PaymentToken: '123e4567-e89b-12d3-a456-426614174003' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(paymentCalls, 0);
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
    checkoutApi.createCheckoutPayment = originalCreatePayment;
  }
});

test('SOP validation errors restore the form so the guest can submit again', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  let calls = 0;
  const options: CieloSopOptions[] = [];
  checkoutApi.getCieloSopAccessToken = async () => ({
    environment: 'sandbox',
    accessToken: 'token-sentinel',
  });
  window.bpSop_silentOrderPost = (next) => {
    calls += 1;
    options.push(next);
  };

  try {
    const { container, getByRole, findByRole } = render(
      React.createElement(CieloSopCardForm, {
        reference: 'E'.repeat(40),
        amount: '850.00',
        credentials: { type: 'resume-token', resumeToken: 'W'.repeat(64) },
        onAttemptFinished: () => {},
      }),
    );
    await waitFor(() =>
      assert.equal(
        getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
        false,
      ),
    );

    submitCardForm(container.querySelector('form')!);
    options[0]!.onError({});
    await findByRole('alert');
    assert.match(getByRole('alert').textContent ?? '', /validar o cartão/);
    assert.equal(
      getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
      false,
    );

    submitCardForm(container.querySelector('form')!);
    assert.equal(calls, 2);
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
  }
});
