import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { checkoutApi, type CheckoutResumeResponse } from '../src/services/checkoutApi.ts';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import type { CieloSopOptions } from '../src/services/cieloSopSdk.ts';

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
const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { SinglePageCheckout } = await import('../src/components/booking/SinglePageCheckout.tsx');
const { CheckoutEntry } = await import('../src/components/booking/CheckoutEntry.tsx');
const originals = { ...checkoutApi };
const originalPrice = crcnBackendApi.calculatePrice;
const originalHostedReadiness = crcnBackendApi.getStaysCheckoutReadiness;
const reference = 'U'.repeat(40);
const bookingData = {
  property: STAYS_NET_APARTMENTS[0]!,
  checkIn: '2026-11-10',
  checkOut: '2026-11-13',
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  nights: 3,
  totalAmount: 3001,
  cleaningFee: 0,
  serviceFee: 0,
  discount: 0,
  quote: {
    success: true as const,
    listingId: 'JQ08G',
    nights: 3,
    dailyRate: 1000.33,
    baseTotal: 3001,
    total: 3001,
    cleaningFee: 0,
    serviceFee: 0,
    discount: 0,
    currency: 'BRL' as const,
    feesIncluded: true,
    fees: [],
    source: 'stays-live' as const,
    breakdown: {
      dailyRateText: '3 noites',
      cleaningFeeText: '',
      serviceFeeText: '',
      totalText: 'R$ 3.001,00',
    },
  },
};
const payment = {
  enabled: true,
  methods: ['card'] as Array<'card'>,
  publicKey: null,
  provider: 'cielo_sandbox' as const,
};
const order: CheckoutResumeResponse['order'] = {
  status: 'pre_reservado',
  publicReference: reference,
  reservationConfirmed: false,
  listingId: bookingData.property.id,
  guestName: 'Sandbox Guest',
  from: bookingData.checkIn,
  to: bookingData.checkOut,
  quoteTotal: '3001.00',
  currency: 'BRL',
  paymentStatus: null,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  createdAt: null,
};

afterEach(() => {
  cleanup();
  Object.assign(checkoutApi, originals);
  crcnBackendApi.calculatePrice = originalPrice;
  crcnBackendApi.getStaysCheckoutReadiness = originalHostedReadiness;
  delete window.bpSop_silentOrderPost;
  window.history.replaceState(null, '', '/');
});

function setup(
  parkTicketsPreviewEnabled = false,
  checkoutPayment: CheckoutResumeResponse['payment'] = payment,
) {
  checkoutApi.getCheckoutTerms = async () => ({
    kind: 'ready',
    data: {
      success: true,
      terms: { version: 'v1', snapshot: { Cancelamento: 'Condições fictícias do teste.' } },
    },
  });
  checkoutApi.getCheckoutReadiness = async () => ({
    kind: 'ready',
    data: {
      success: true,
      ready: true,
      termsAvailable: true,
      checkoutEnabled: true,
      singlePageCheckoutEnabled: true,
      parkTicketsPreviewEnabled,
      payment: checkoutPayment,
    },
  });
  return render(
    React.createElement(SinglePageCheckout, {
      bookingData,
      guestPrefill: {
        fullName: 'Sandbox Guest',
        email: 'guest@example.test',
        phone: '11999999999',
      },
      onClose() {},
    }),
  );
}

async function fill(view: ReturnType<typeof setup>) {
  await waitFor(() =>
    assert.equal(
      view.getByRole('checkbox', { name: /Li e aceito/ }).hasAttribute('disabled'),
      false,
    ),
  );
  fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito/ }));
  for (const [label, value] of [
    ['Número do cartão', '4111111111111111'],
    ['Validade (MM/AAAA)', '12/2030'],
    ['Código de segurança', '123'],
    ['CPF ou CNPJ do titular', '12345678909'],
  ]) {
    fireEvent.change(view.getByLabelText(label), { target: { value } });
  }
}

test('one submit prepares the reservation then tokenizes and pays without leaving the page or duplicating submission', async () => {
  const calls: string[] = [];
  let options: CieloSopOptions | undefined;
  checkoutApi.createCheckout = async () => {
    calls.push('reservation');
    return {
      success: true,
      order,
      payment,
      idempotentReplay: false,
      resume: {
        reference,
        token: 'T'.repeat(64),
        path: `/checkout/${reference}`,
        expiresAt: order.expiresAt!,
      },
    };
  };
  checkoutApi.getCieloSopAccessToken = async () => {
    calls.push('access-token');
    return { environment: 'sandbox', accessToken: 'sandbox-fixture' };
  };
  window.bpSop_silentOrderPost = (value) => {
    calls.push('tokenize');
    options = value;
  };
  checkoutApi.createCheckoutPayment = async (...args) => {
    calls.push('payment');
    assert.equal(JSON.stringify(args).includes('4111111111111111'), false);
    assert.equal(args[0], reference);
    return {
      kind: 'response',
      success: true,
      code: 'payment_created',
      message: 'Pagamento registrado.',
      replayed: false,
      payment: null,
    };
  };
  checkoutApi.resumeCheckout = async () => ({
    kind: 'ready',
    data: {
      success: true,
      order: {
        ...order,
        status: 'confirmado',
        reservationConfirmed: true,
        paymentStatus: 'approved',
      },
      confirmation: { reservationCode: 'SIMULATED-1', confirmedAt: null },
      payment,
    },
  });
  const view = setup();
  await fill(view);
  assert.deepEqual(calls, []);
  fireEvent.submit(view.container.querySelector('form')!);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.deepEqual(calls, ['reservation', 'access-token', 'tokenize']));
  assert.equal(
    view.getByRole('heading', { name: 'Confirme e pague' }).textContent,
    'Confirme e pague',
  );
  assert.equal(window.location.pathname, `/checkout/${reference}`);
  assert.equal(window.location.href.includes('T'.repeat(64)), false);
  options!.onSuccess({ PaymentToken: '11111111-1111-4111-8111-111111111111' });
  await waitFor(() => assert.ok(view.getByText('Reserva confirmada!')));
  assert.deepEqual(calls, ['reservation', 'access-token', 'tokenize', 'payment']);
  assert.ok(view.getByText('SIMULATED-1'));
});

test('Pix stays on the checkout, has no surcharge and waits for authoritative confirmation', async () => {
  const calls: string[] = [];
  const pixPayment = {
    ...payment,
    methods: ['card', 'pix'] as Array<'card' | 'pix'>,
  };
  checkoutApi.createCheckout = async () => {
    calls.push('reservation');
    return {
      success: true,
      order,
      payment: pixPayment,
      idempotentReplay: false,
      resume: {
        reference,
        token: 'T'.repeat(64),
        path: `/checkout/${reference}`,
        expiresAt: order.expiresAt!,
      },
    };
  };
  checkoutApi.getCieloSopAccessToken = async () => {
    calls.push('unexpected-tokenization');
    return null;
  };
  checkoutApi.createCheckoutPayment = async (_reference, _credentials, amount, payload) => {
    calls.push('pix');
    assert.equal(amount, '3001.00');
    assert.deepEqual(
      { paymentMethod: payload.paymentMethod, paymentMethodId: payload.paymentMethodId },
      { paymentMethod: 'pix', paymentMethodId: 'pix' },
    );
    return {
      kind: 'response',
      success: true,
      code: 'payment_pending',
      message: 'Pix gerado.',
      replayed: false,
      payment: null,
    };
  };
  checkoutApi.resumeCheckout = async () => ({
    kind: 'ready',
    data: {
      success: true,
      order: { ...order, status: 'pagamento_pendente', paymentStatus: 'pending' },
      confirmation: null,
      payment: {
        ...pixPayment,
        attempt: {
          status: 'pending',
          method: 'pix',
          amount: '3001.00',
          baseAmount: '3001.00',
          processingFeeAmount: '0.00',
          processingFeeRate: '0.00',
          currency: 'BRL',
          expiresAt: order.expiresAt,
          paidAt: null,
          pix: {
            copyPaste: '00020101021226890014br.gov.bcb.pix',
            qrCodeBase64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
        },
      },
    },
  });

  const view = setup(false, pixPayment);
  await waitFor(() =>
    assert.equal(
      view.getByRole('button', { name: 'Pix, aprovação rápida' }).hasAttribute('disabled'),
      false,
    ),
  );
  fireEvent.click(view.getByRole('button', { name: 'Pix, aprovação rápida' }));
  fireEvent.click(view.getByRole('checkbox', { name: /Li e aceito/ }));
  fireEvent.submit(view.container.querySelector('form')!);

  await waitFor(() => assert.ok(view.getByText('Pix gerado · aguardando pagamento')));
  assert.deepEqual(calls, ['reservation', 'pix']);
  assert.equal(window.location.pathname, `/checkout/${reference}`);
  assert.ok(view.getByLabelText('Código Pix copia e cola'));
  assert.ok(view.getByText(/só será confirmada após a consulta segura do pagamento/i));
});

test('a changed quote requires fresh consent and never starts Cielo', async () => {
  let tokens = 0;
  checkoutApi.createCheckout = async () => ({
    success: false,
    code: 'quote_changed',
    payment,
    idempotentReplay: false,
  });
  checkoutApi.getCieloSopAccessToken = async () => {
    tokens++;
    return null;
  };
  crcnBackendApi.calculatePrice = async () => ({ ...bookingData.quote, total: 3200 });
  const view = setup();
  await fill(view);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    assert.match(view.getByRole('alert').textContent!, /preço ou a disponibilidade mudou/),
  );
  assert.equal(
    (view.getByRole('checkbox', { name: /Li e aceito/ }) as HTMLInputElement).checked,
    false,
  );
  assert.equal(tokens, 0);
  assert.equal(window.location.pathname, '/');
  assert.match(view.getByRole('button', { name: /Confirmar e pagar/ }).textContent!, /3.403,90/);
});

test('a recovered paid order is displayed without tokenization or another payment', async () => {
  let tokens = 0;
  checkoutApi.createCheckout = async () => ({
    success: true,
    order: { ...order, status: 'pago_em_confirmacao', paymentStatus: 'approved' },
    payment,
    idempotentReplay: true,
    resume: {
      reference,
      token: 'T'.repeat(64),
      path: `/checkout/${reference}`,
      expiresAt: order.expiresAt!,
    },
  });
  checkoutApi.getCieloSopAccessToken = async () => {
    tokens++;
    return null;
  };
  checkoutApi.resumeCheckout = async () => ({
    kind: 'ready',
    data: {
      success: true,
      order: { ...order, status: 'pagamento_recusado', paymentStatus: 'rejected' },
      confirmation: null,
      payment,
    },
  });
  const view = setup();
  await fill(view);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.ok(view.getByText('Pagamento não aprovado')));
  assert.equal(tokens, 0);
  assert.equal(view.queryByRole('button', { name: /Confirmar e pagar/ }), null);
  fireEvent.click(view.getByRole('button', { name: 'Atualizar situação' }));
  assert.equal(tokens, 0);
});

test('park tickets stay absent even if an old preview flag is returned', async () => {
  const view = setup(true);
  await fill(view);
  assert.equal(view.queryByRole('checkbox', { name: /Sim, quero adicionar ingressos/ }), null);
  assert.equal(
    view.getByRole('button', { name: /Confirmar e pagar/ }).hasAttribute('disabled'),
    false,
  );
});

for (const enabled of [false, undefined, true]) {
  test(`checkout entry selects only an explicitly enabled pilot: ${String(enabled)}`, async () => {
    let orders = 0;
    checkoutApi.createCheckout = async () => {
      orders++;
      return null;
    };
    checkoutApi.getCheckoutReadiness = async () => ({
      kind: 'ready',
      data: {
        success: true,
        ready: true,
        checkoutEnabled: true,
        termsAvailable: true,
        singlePageCheckoutEnabled: enabled,
        parkTicketsPreviewEnabled: false,
        payment,
      },
    });
    checkoutApi.getCheckoutTerms = async () => ({
      kind: 'ready',
      data: {
        success: true,
        terms: { version: 'v1', snapshot: { Cancelamento: 'Condições de teste.' } },
      },
    });
    crcnBackendApi.getStaysCheckoutReadiness = async () => ({
      ready: true,
      code: null,
      message: 'Checkout Stays disponível.',
    });
    const view = render(
      React.createElement(CheckoutEntry, {
        isOpen: true,
        bookingData,
        currency: 'BRL',
        guestPrefill: {
          fullName: 'Sandbox Guest',
          email: 'guest@example.test',
          phone: '11999999999',
        },
        onClose() {},
      }),
    );
    await waitFor(
      () =>
        assert.ok(
          view.getByRole('heading', {
            name: enabled === true ? 'Confirme e pague' : 'Resumo da reserva',
          }),
        ),
      { timeout: 10000 },
    );
    assert.equal(view.queryByRole('checkbox', { name: /Sim, quero adicionar ingressos/ }), null);
    assert.equal(orders, 0);
  });
}

test('readiness failure falls back to Stays without creating an order', async () => {
  checkoutApi.getCheckoutReadiness = async () => {
    throw new Error('Network unavailable');
  };
  crcnBackendApi.getStaysCheckoutReadiness = async () => ({
    ready: true,
    code: null,
    message: 'Checkout Stays disponível.',
  });
  const view = render(
    React.createElement(CheckoutEntry, {
      isOpen: true,
      bookingData,
      currency: 'BRL',
      guestPrefill: { fullName: '', email: '', phone: '' },
      onClose() {},
    }),
  );
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Continuar na Stays' })), {
    timeout: 10000,
  });
});

test('a slow readiness response cannot replace Stays after the timeout', async () => {
  const originalTimeout = window.setTimeout;
  let expire: (() => void) | undefined;
  let finish:
    ((value: Awaited<ReturnType<typeof checkoutApi.getCheckoutReadiness>>) => void) | undefined;
  window.setTimeout = ((callback: () => void, delay?: number) => {
    if (delay === 2500) {
      expire = callback;
      return 12345;
    }
    return originalTimeout(callback, delay);
  }) as typeof window.setTimeout;
  checkoutApi.getCheckoutReadiness = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  crcnBackendApi.getStaysCheckoutReadiness = async () => ({
    ready: true,
    code: null,
    message: 'Checkout Stays disponível.',
  });
  try {
    const view = render(
      React.createElement(CheckoutEntry, {
        isOpen: true,
        bookingData,
        currency: 'BRL',
        guestPrefill: { fullName: '', email: '', phone: '' },
        onClose() {},
      }),
    );
    const { act } = await import('@testing-library/react');
    await act(async () => {
      expire!();
    });
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Resumo da reserva' })), {
      timeout: 10000,
    });
    await act(async () => {
      finish!({
        kind: 'ready',
        data: {
          success: true,
          ready: true,
          checkoutEnabled: true,
          termsAvailable: true,
          singlePageCheckoutEnabled: true,
          payment,
        },
      });
    });
    assert.equal(view.queryByRole('heading', { name: 'Confirme e pague' }), null);
  } finally {
    window.setTimeout = originalTimeout;
  }
});
