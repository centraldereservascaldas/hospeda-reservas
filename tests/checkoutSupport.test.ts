import assert from 'node:assert/strict';
import test from 'node:test';
import { getCheckoutSupportUrl } from '../src/utils/checkoutSupport.ts';

test('WhatsApp shares booking intent and totals without customer or payment secrets', () => {
  const context = {
    listingId: 'LG02J',
    listingTitle: 'Aquarius Flat B 301',
    from: '2026-11-19',
    to: '2026-11-21',
    guests: { adults: 2, children: 1, infants: 0, pets: 1 },
    paymentMethod: 'card' as const,
    installments: 6,
    baseTotal: 995,
    total: 1213.42,
    reference: 'R'.repeat(40),
    guestName: 'PRIVATE_NAME',
    email: 'PRIVATE_EMAIL',
    phone: 'PRIVATE_PHONE',
    cpf: 'PRIVATE_CPF',
    token: 'PRIVATE_TOKEN',
    copyPaste: 'PRIVATE_PIX',
    cardNumber: 'PRIVATE_CARD',
  };
  const url = new URL(getCheckoutSupportUrl(context));
  assert.equal(url.origin + url.pathname, 'https://wa.me/5564992946675');
  const message = url.searchParams.get('text')!;
  for (const expected of [
    'LG02J',
    'Aquarius Flat B 301',
    '19/11/2026',
    '21/11/2026',
    '2 adulto(s)',
    'Cartão',
    '6x',
    '995,00',
    '1.213,42',
    context.reference,
  ]) {
    assert.ok(message.includes(expected), expected);
  }
  assert.equal(message.includes('PRIVATE_'), false);
});

test('Pix support has no installment text or session access URL', () => {
  const message = new URL(
    getCheckoutSupportUrl({ paymentMethod: 'pix', total: 995 }),
  ).searchParams.get('text')!;
  assert.ok(message.includes('Pix'));
  assert.equal(message.includes('Parcelamento'), false);
  assert.equal(message.includes('/checkout/'), false);
});

test('support may share only the verified reservation balance without inventing payment method', () => {
  const message = new URL(getCheckoutSupportUrl({ reservationCode: 'ZX91K', balanceTotal: 1016 })).searchParams.get('text')!;
  assert.ok(message.includes('ZX91K'));
  assert.ok(message.includes('Saldo para conferência: R$ 1.016,00'));
  assert.equal(message.includes('Como quero pagar:'), false);
});
