import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutPathWithStayQuery, checkoutStayFromSearch, checkoutUrlWithStay, existingReservationCodeFromPath, existingReservationUrl } from '../src/utils/checkoutUrl';

test('reservation links accept lowercase and a trailing slash without capturing order references', () => {
  assert.equal(existingReservationCodeFromPath('/checkout/zx91k/'), 'ZX91K');
  assert.equal(existingReservationCodeFromPath('/checkout/ZX91K'), 'ZX91K');
  assert.equal(existingReservationCodeFromPath(`/checkout/${'a'.repeat(40)}`), undefined);
  assert.equal(existingReservationCodeFromPath('/checkout/ZX91K/pagamento-confirmado'), undefined);
});

test('checkout URL carries the selected stay without personal or payment data', () => {
  const reference = 'A'.repeat(40);
  const path = checkoutUrlWithStay(`/checkout/${reference}`, {
    listingId: 'LG02J',
    from: '2027-01-08',
    to: '2027-01-10',
    guests: { adults: 2, children: 1, infants: 0, pets: 1 },
  });
  const url = new URL(path, 'https://example.test');
  assert.equal(url.pathname, `/checkout/${reference}`);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    accommodation: 'LG02J', checkin: '2027-01-08', checkout: '2027-01-10',
    adults: '2', children: '1', pets: '1', currency: 'BRL',
  });
});

test('existing reservation URL includes only validated server-supplied stay details', () => {
  const url = new URL(existingReservationUrl('ZX91K', { listingId: 'LISTING', checkIn: '2026-11-19', checkOut: '2026-11-22', guests: 4, adults: 4, children: 0, infants: 0 }, '?utm_source=google&token=secret&entrada=2000-01-01'), 'https://example.test');
  assert.equal(url.pathname, '/checkout/ZX91K');
  assert.deepEqual(Object.fromEntries(url.searchParams), { accommodation: 'LISTING', checkin: '2026-11-19', checkout: '2026-11-22', guests: '4', adults: '4', children: '0', infants: '0', utm_source: 'google' });
});

test('confirmation retains stay parameters without copying tokens or duplicate parameters', () => {
  const result = checkoutPathWithStayQuery('/checkout/ref/pagamento-confirmado',
    '?checkin=2027-01-08&adults=2&token=secret&checkout=first&checkout=second');
  assert.equal(result, '/checkout/ref/pagamento-confirmado?checkin=2027-01-08&adults=2');
});

test('existing checkout and confirmation retain safe ad attribution without propagating credentials or malformed trip data', () => {
  const shortPath = existingReservationUrl('ZX91K', { listingId: 'LISTING', checkIn: '2030-11-19', checkOut: '2030-11-22', guests: 4, adults: 4, children: 0, infants: 0 }, '?utm_source=google&utm_campaign=verao-2030&gclid=abc123&utm_term=12345678900&token=private');
  const shortUrl = new URL(shortPath, 'https://example.test');
  const reference = 'A'.repeat(40);
  const pending = new URL(checkoutPathWithStayQuery(`/checkout/${reference}`, shortUrl.search), 'https://example.test');
  const confirmed = new URL(checkoutPathWithStayQuery(`/checkout/${reference}/pagamento-confirmado`, pending.search), 'https://example.test');
  assert.equal(confirmed.searchParams.get('checkin'), '2030-11-19');
  assert.equal(confirmed.searchParams.get('guests'), '4');
  assert.equal(confirmed.searchParams.get('utm_source'), 'google');
  assert.equal(confirmed.searchParams.get('utm_campaign'), 'verao-2030');
  assert.equal(confirmed.searchParams.get('gclid'), 'abc123');
  assert.equal(confirmed.searchParams.has('utm_term'), false);
  assert.equal(confirmed.searchParams.has('token'), false);
  const invalid = new URL(checkoutPathWithStayQuery('/checkout/reference', '?accommodation=private%40example.com&adults=999&checkin=not-a-date&utm_source=google&utm_source=other&token=private'), 'https://example.test');
  assert.equal(invalid.search, '');

  const direct = new URL(checkoutUrlWithStay('/checkout', {
    listingId: 'LG02J', from: '2027-01-08', to: '2027-01-10',
    guests: { adults: 2, children: 1, infants: 0, pets: 0 },
  }, '?utm_campaign=summer%20sale&utm_campaign_id=12345678&currency=BRL&child_ages=5&token=secret'), 'https://example.test');
  assert.equal(direct.pathname, '/checkout');
  assert.equal(direct.searchParams.get('utm_campaign'), 'summer sale');
  assert.equal(direct.searchParams.get('utm_campaign_id'), '12345678');
  assert.equal(direct.searchParams.get('currency'), 'BRL');
  assert.equal(direct.searchParams.has('child_ages'), false);
  assert.equal(direct.searchParams.has('token'), false);
  assert.deepEqual(checkoutStayFromSearch(direct.search), {
    listingId: 'LG02J', from: '2027-01-08', to: '2027-01-10',
    guests: { adults: 2, children: 1, infants: 0, pets: 0 },
  });
  assert.equal(checkoutStayFromSearch('?accommodation=LG02J&checkin=2027-01-08&checkout=2027-01-10&adults=2&adults=3'), null);
});
