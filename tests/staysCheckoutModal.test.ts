import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { crcnBackendApi } from '../src/services/crcnBackendApi.ts';
import type { AppOverlayBookingPayload } from '../src/types/booking.ts';

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
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { StaysCheckoutModal } = await import('../src/components/booking/StaysCheckoutModal.tsx');
const originalReadiness = crcnBackendApi.getStaysCheckoutReadiness;
const originalStartCheckout = crcnBackendApi.startStaysCheckout;

const property = STAYS_NET_APARTMENTS[0]!;
const bookingData: AppOverlayBookingPayload = {
  property,
  checkIn: '2026-11-11',
  checkOut: '2026-11-13',
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  nights: 2,
  totalAmount: 400,
  cleaningFee: 0,
  serviceFee: 0,
  discount: 0,
  quote: {
    success: true,
    listingId: property.id,
    staysListingId: property.staysListingId,
    nights: 2,
    dailyRate: 200,
    baseTotal: 400,
    cleaningFee: 0,
    serviceFee: 0,
    discount: 0,
    total: 400,
    currency: 'BRL',
    feesIncluded: true,
    cleaningIncluded: true,
    fees: [],
    source: 'stays-live',
    breakdown: {
      dailyRateText: 'R$ 200,00 x 2 noites',
      cleaningFeeText: 'Incluída',
      serviceFeeText: 'Incluída',
      totalText: 'R$ 400,00',
    },
  },
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  crcnBackendApi.getStaysCheckoutReadiness = originalReadiness;
  crcnBackendApi.startStaysCheckout = originalStartCheckout;
});

function renderModal() {
  return render(
    React.createElement(StaysCheckoutModal, {
      isOpen: true,
      onClose: () => {},
      bookingData,
      guestPrefill: { fullName: 'Pessoa Teste', email: 'pessoa@example.test', phone: '' },
      currency: 'BRL' as const,
    }),
  );
}

test('does not render personal-data fields while hosted checkout is disabled', async () => {
  crcnBackendApi.getStaysCheckoutReadiness = async () => ({
    ready: false,
    code: 'checkout_disabled',
    message: 'O checkout ainda não está habilitado.',
  });

  renderModal();
  await waitFor(() =>
    assert.equal(screen.getByRole('alert').textContent, 'O checkout ainda não está habilitado.'),
  );
  assert.equal(screen.queryByLabelText('Nome e sobrenome'), null);
  assert.equal(screen.queryByLabelText('E-mail'), null);
  assert.equal(screen.queryByRole('button', { name: 'Continuar na Stays' }), null);
});

test('renders only the minimal contact fields after readiness succeeds', async () => {
  crcnBackendApi.getStaysCheckoutReadiness = async () => ({
    ready: true,
    code: null,
    message: 'Checkout disponível.',
  });

  renderModal();
  await waitFor(() => assert.ok(screen.getByLabelText('Nome e sobrenome')));
  assert.equal(
    (screen.getByLabelText('Nome e sobrenome') as HTMLInputElement).value,
    'Pessoa Teste',
  );
  assert.equal((screen.getByLabelText('E-mail') as HTMLInputElement).value, 'pessoa@example.test');
  assert.equal(screen.queryByLabelText('Telefone'), null);
  assert.ok(screen.getByRole('link', { name: 'Política de Privacidade' }));
  assert.ok(screen.getByRole('button', { name: 'Continuar na Stays' }));
});

test('submits the validated stay to the backend and follows only the hosted Stays link', async () => {
  crcnBackendApi.getStaysCheckoutReadiness = async () => ({
    ready: true,
    code: null,
    message: 'Checkout disponível.',
  });
  let submitted: Parameters<typeof crcnBackendApi.startStaysCheckout>[0] | null = null;
  crcnBackendApi.startStaysCheckout = async (payload) => {
    submitted = payload;
    return {
      success: true,
      checkoutUrl:
        'https://www.centraldereservascaldas.com.br/customer/pt/reservation/ABC123/details',
    };
  };
  let checkoutHref = '';
  const captureCheckout = (event: Event) => {
    const target = event.target;
    if (!(target instanceof dom.window.HTMLAnchorElement)) return;
    if (target.dataset.staysCheckoutLink !== 'true') return;
    event.preventDefault();
    checkoutHref = target.href;
  };
  document.addEventListener('click', captureCheckout);

  try {
    renderModal();
    const continueButton = await screen.findByRole('button', { name: 'Continuar na Stays' });
    fireEvent.submit(continueButton.closest('form')!);

    await waitFor(() => assert.notEqual(checkoutHref, ''));
    assert.deepEqual(submitted, {
      listingId: property.staysListingId || property.id,
      from: '2026-11-11',
      to: '2026-11-13',
      guests: 2,
      quoteTotal: 400,
      guest: { fullName: 'Pessoa Teste', email: 'pessoa@example.test' },
    });
    assert.equal(
      checkoutHref,
      'https://www.centraldereservascaldas.com.br/customer/pt/reservation/ABC123/details',
    );
  } finally {
    document.removeEventListener('click', captureCheckout);
  }
});
