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

afterEach(() => {
  cleanup();
  delete window.bpSop_silentOrderPost;
});

test('Cielo tokenization sends only the temporary token and cardholder data to the backend', async () => {
  const originalGetToken = checkoutApi.getCieloSopAccessToken;
  const originalCreatePayment = checkoutApi.createCheckoutPayment;
  const capturedSop = { options: null as CieloSopOptions | null };
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
        getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'),
        false,
      ),
    );

    fireEvent.change(getByLabelText('Número do cartão'), { target: { value: '4111111111111111' } });
    fireEvent.change(getByLabelText('Código de segurança'), { target: { value: '123' } });
    fireEvent.change(getByLabelText('Nome no cartão'), { target: { value: ' Synthetic Guest ' } });
    fireEvent.change(getByLabelText('E-mail do titular'), {
      target: { value: 'guest@example.test' },
    });
    fireEvent.change(getByLabelText('CPF ou CNPJ do titular'), {
      target: { value: '123.456.789-01' },
    });
    fireEvent.submit(container.querySelector('form')!);

    assert.equal(capturedSop.options?.environment, 'sandbox');
    assert.equal(capturedSop.options?.language, 'pt');
    assert.equal(capturedSop.options?.enableTokenize, false);
    assert.equal(capturedSop.options?.accessToken, 'browser-access-token-sentinel');
    capturedSop.options?.onSuccess({ PaymentToken: '123e4567-e89b-12d3-a456-426614174000' });

    await waitFor(() => assert.ok(submitted));
    assert.equal(submitted?.[0], 'R'.repeat(40));
    assert.deepEqual(submitted?.[1], { type: 'resume-token', resumeToken: 'T'.repeat(64) });
    assert.equal(submitted?.[2], '850.00');
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
        installments: 1,
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
        getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'),
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
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.ok(capturedSop.options);
    assert.equal(sopCalls, 1);
    assert.equal(
      getByRole('button', { name: 'Enviando pagamento…' }).hasAttribute('disabled'),
      true,
    );
    fireEvent.submit(form);
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
    assert.equal(getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'), false);

    fireEvent.submit(form);
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
        getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'),
        false,
      ),
    );

    assert.doesNotThrow(() => fireEvent.submit(container.querySelector('form')!));
    assert.match((await findByRole('alert')).textContent ?? '', /validação segura do cartão/);
    assert.equal(getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'), false);
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
        getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'),
        false,
      ),
    );

    fireEvent.submit(container.querySelector('form')!);
    assert.equal(
      getByRole('button', { name: 'Enviando pagamento…' }).hasAttribute('disabled'),
      true,
    );
    timeout.callback?.();
    assert.match((await findByRole('alert')).textContent ?? '', /demorou mais que o esperado/);
    assert.equal(getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'), false);

    fireEvent.submit(container.querySelector('form')!);
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
        getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'),
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
    fireEvent.submit(container.querySelector('form')!);
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
        getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'),
        false,
      ),
    );

    fireEvent.submit(container.querySelector('form')!);
    options[0]!.onError({});
    await findByRole('alert');
    assert.match(getByRole('alert').textContent ?? '', /validar o cartão/);
    assert.equal(getByRole('button', { name: 'Pagar com cartão' }).hasAttribute('disabled'), false);

    fireEvent.submit(container.querySelector('form')!);
    assert.equal(calls, 2);
  } finally {
    checkoutApi.getCieloSopAccessToken = originalGetToken;
  }
});
