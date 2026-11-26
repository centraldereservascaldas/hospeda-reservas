import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { checkoutApi } from '../src/services/checkoutApi.ts';

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
  HTMLFormElement: dom.window.HTMLFormElement,
  FormData: dom.window.FormData,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const React = (await import('react')).default;
const { act, cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
const { CheckoutModal } = await import('../src/components/booking/CheckoutModal.tsx');
const { CieloCheckoutIframe } = await import('../src/components/booking/CieloCheckoutIframe.tsx');

const bookingData = {
  property: STAYS_NET_APARTMENTS[0]!,
  checkIn: '2026-11-11',
  checkOut: '2026-11-13',
  guests: { adults: 1, children: 0, infants: 0, pets: 0 },
  nights: 2,
  totalAmount: 400,
  cleaningFee: 0,
  serviceFee: 0,
  discount: 0,
  quote: {
    success: true as const,
    listingId: 'JQ08G',
    staysListingId: 'JQ08G',
    nights: 2,
    dailyRate: 200,
    baseTotal: 400,
    cleaningFee: 0,
    serviceFee: 0,
    discount: 0,
    total: 400,
    currency: 'BRL' as const,
    feesIncluded: false,
    cleaningIncluded: false,
    fees: [],
    source: 'stays-live' as const,
    breakdown: {
      dailyRateText: 'R$ 200,00 x 2 noites',
      cleaningFeeText: 'Taxa de limpeza',
      serviceFeeText: 'Taxa de serviço',
      totalText: 'R$ 400,00',
    },
  },
};

const readyTerms = {
  kind: 'ready' as const,
  data: {
    success: true as const,
    terms: { version: 'terms-v1', snapshot: { Cancelamento: 'Consulte as regras do imóvel.' } },
  },
};

const readyForCardPayment = {
  kind: 'ready' as const,
  data: {
    success: true as const,
    ready: true,
    termsAvailable: true,
    checkoutEnabled: true,
    payment: {
      enabled: true,
      methods: ['card'] as Array<'card'>,
      publicKey: null,
      provider: 'cielo_hosted' as const,
    },
  },
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('prefills authenticated guest details, updates after session restore, and leaves fields editable', async () => {
  const originalGetCheckoutTerms = checkoutApi.getCheckoutTerms;
  const originalGetCheckoutReadiness = checkoutApi.getCheckoutReadiness;
  const originalCreateCheckout = checkoutApi.createCheckout;
  let submittedGuest: { fullName: string; email: string; phone: string } | null = null;
  checkoutApi.getCheckoutTerms = async () => readyTerms;
  checkoutApi.getCheckoutReadiness = async () => readyForCardPayment;
  checkoutApi.createCheckout = async (payload) => {
    submittedGuest = payload.guest;
    return null;
  };

  try {
    const props = {
      isOpen: true,
      onClose: () => {},
      bookingData,
      guestPrefill: { fullName: '', email: '', phone: '' },
      currency: 'BRL' as const,
    };
    const { getByLabelText, getByRole, getByText, rerender } = render(
      React.createElement(CheckoutModal, props),
    );
    const name = getByLabelText('Nome completo') as HTMLInputElement;
    const email = getByLabelText('E-mail') as HTMLInputElement;
    const phone = getByLabelText('Telefone') as HTMLInputElement;

    await waitFor(() =>
      assert.equal(
        (getByText('Condições desta hospedagem') as HTMLElement).textContent,
        'Condições desta hospedagem',
      ),
    );

    await act(async () => {
      rerender(
        React.createElement(CheckoutModal, {
          ...props,
          guestPrefill: { fullName: 'Maria da Silva', email: 'maria@example.com', phone: '' },
        }),
      );
    });

    assert.equal(name.value, 'Maria da Silva');
    assert.equal(email.value, 'maria@example.com');
    assert.equal(phone.value, '');
    assert.equal(name.disabled, false);
    assert.equal(email.disabled, false);
    assert.equal(phone.disabled, false);

    fireEvent.change(name, { target: { value: 'Maria Silva (revisado)' } });
    fireEvent.change(phone, { target: { value: '+5511999990000' } });
    await act(async () => {
      rerender(
        React.createElement(CheckoutModal, {
          ...props,
          guestPrefill: { fullName: 'Maria da Silva', email: 'maria@example.com', phone: '' },
        }),
      );
    });
    assert.equal(name.value, 'Maria Silva (revisado)');
    assert.equal(phone.value, '+5511999990000');

    assert.ok(
      getByText(
        'O pedido será validado e pré-reservado antes de você continuar para o checkout seguro da Cielo.',
      ),
    );
    fireEvent.click(getByRole('checkbox'));
    const continueButton = getByRole('button', { name: 'Continuar para pagamento com cartão' });
    assert.equal((continueButton as HTMLButtonElement).disabled, false);

    await act(async () => {
      fireEvent.click(continueButton);
    });
    await waitFor(() =>
      assert.deepEqual(submittedGuest, {
        fullName: 'Maria Silva (revisado)',
        email: 'maria@example.com',
        phone: '+5511999990000',
      }),
    );
  } finally {
    checkoutApi.getCheckoutTerms = originalGetCheckoutTerms;
    checkoutApi.getCheckoutReadiness = originalGetCheckoutReadiness;
    checkoutApi.createCheckout = originalCreateCheckout;
  }
});

test('renders Cielo checkout in a restricted iframe and exposes the direct fallback link', () => {
  const { container, getByRole } = render(
    React.createElement(CieloCheckoutIframe, {
      reference: 'checkout-reference-test',
      amount: '400.00',
      checkoutUrl: 'https://cieloecommerce.cielo.com.br/test-checkout',
      onAttemptStarted: () => undefined,
    }),
  );

  const iframe = container.querySelector('iframe');
  assert.ok(iframe);
  assert.equal(iframe.title, 'Checkout seguro da Cielo para pagamento com cartão');
  assert.equal(iframe.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms');
  assert.equal(iframe.getAttribute('src'), 'https://cieloecommerce.cielo.com.br/test-checkout');
  const fallbackLink = getByRole('link', {
    name: 'Se o checkout não abrir aqui, continue no site seguro da Cielo',
  });
  assert.equal(
    fallbackLink.getAttribute('href'),
    'https://cieloecommerce.cielo.com.br/test-checkout',
  );
});
