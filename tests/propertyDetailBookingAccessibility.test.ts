import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';

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
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { PropertyDetailModal } = await import('../src/components/PropertyDetailModal.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('booking calendar names full dates and exposes the active date field', async () => {
  const originalGetCalendar = crcnBackendApi.getAccommodationCalendar;
  const originalCalculatePrice = crcnBackendApi.calculatePrice;
  crcnBackendApi.getAccommodationCalendar = async () => [];
  crcnBackendApi.calculatePrice = async () => null;
  try {
    const { container, getByRole, queryByRole } = render(
      React.createElement(PropertyDetailModal, {
        property: STAYS_NET_APARTMENTS[0]!,
        initialCheckIn: '2026-11-11',
        initialCheckOut: '2026-11-15',
        initialGuests: { adults: 2, children: 0, infants: 0, pets: 0 },
        onClose: () => {},
        currency: 'BRL',
        isSaved: false,
        onToggleSave: () => {},
        onStartBooking: () => {},
      }),
    );

    const [checkIn, checkOut] = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-controls="stay-dates-dialog"]'),
    );
    assert.ok(checkIn);
    assert.ok(checkOut);
    checkIn.focus();
    fireEvent.click(checkIn);

    const calendar = getByRole('dialog', { name: 'Escolha as datas' });
    const dateFieldButtons = Array.from(
      calendar.querySelectorAll<HTMLButtonElement>('button'),
    ).filter(
      (button) =>
        button.textContent?.includes('Check-in') || button.textContent?.includes('Check-out'),
    );
    const checkInTab = dateFieldButtons.find((button) => button.textContent?.includes('Check-in'))!;
    const checkOutTab = dateFieldButtons.find((button) =>
      button.textContent?.includes('Check-out'),
    )!;
    assert.equal(checkIn.getAttribute('aria-expanded'), 'true');
    assert.equal(checkOut.getAttribute('aria-expanded'), 'false');
    assert.equal(checkIn.getAttribute('aria-controls'), calendar.id);
    assert.equal(checkInTab.getAttribute('aria-pressed'), 'true');
    assert.equal(checkOutTab.getAttribute('aria-pressed'), 'false');
    assert.ok(calendar.querySelector('button[aria-label*="11 de novembro de 2026"]'));

    fireEvent.click(checkOutTab);
    assert.equal(checkIn.getAttribute('aria-expanded'), 'false');
    assert.equal(checkOut.getAttribute('aria-expanded'), 'true');
    assert.equal(checkInTab.getAttribute('aria-pressed'), 'false');
    assert.equal(checkOutTab.getAttribute('aria-pressed'), 'true');

    const checkoutDate = calendar.querySelector<HTMLButtonElement>(
      'button[aria-label*="16 de novembro de 2026"]',
    );
    assert.ok(checkoutDate);
    fireEvent.click(checkoutDate);
    assert.equal(queryByRole('dialog', { name: 'Escolha as datas' }), null);
    assert.equal(document.activeElement, checkIn);
  } finally {
    crcnBackendApi.getAccommodationCalendar = originalGetCalendar;
    crcnBackendApi.calculatePrice = originalCalculatePrice;
  }
});
