import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

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
const { StaysSearchWidget } = await import('../src/components/search/StaysSearchWidget.tsx');
const { crcnBackendApi } = await import('../src/services/crcnBackendApi.ts');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('date picker announces full dates and restores focus on Escape and selection', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  try {
    const { getByRole, getByText, queryByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        currentFilters: {
          destination: '',
          checkIn: '2026-11-11',
          checkOut: '2026-11-15',
          guests: { adults: 2, children: 0, infants: 0, pets: 0 },
          category: 'all',
          minPrice: 0,
          maxPrice: 100000,
          propertyTypes: [],
          amenities: [],
          minBedrooms: 0,
          minBaths: 0,
          superhostOnly: false,
          instantBookOnly: false,
        },
      }),
    );

    const checkIn = getByRole('button', { name: /Entrada \(Check-in\) 11\/11\/2026/ });
    fireEvent.click(checkIn);

    getByRole('dialog', { name: /Calendário de entrada/ });
    const selectedDate = getByRole('button', { name: /11 de novembro de 2026/ });
    assert.equal(selectedDate.getAttribute('aria-pressed'), 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => assert.equal(document.activeElement, checkIn));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);

    fireEvent.click(checkIn);
    fireEvent.click(getByRole('button', { name: /12 de novembro de 2026/ }));
    assert.equal(queryByRole('dialog', { name: /Calendário de entrada/ }), null);
    assert.equal(checkIn.textContent?.includes('12/11/2026'), true);
    assert.equal(document.activeElement, checkIn);
    assert.ok(getByText('12/11/2026'));
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});

test('exposes the Sofia assistant shortcut in the mobile search heading', async () => {
  const originalGetResorts = crcnBackendApi.getResorts;
  crcnBackendApi.getResorts = async () => [];
  let opened = 0;
  try {
    const { getByRole } = render(
      React.createElement(StaysSearchWidget, {
        onSearchInApp: () => {},
        onOpenAssistant: () => {
          opened += 1;
        },
      }),
    );

    const shortcut = getByRole('button', { name: 'Falar com Sofia, concierge virtual' });
    assert.match(shortcut.className, /sm:hidden/);
    fireEvent.click(shortcut);
    assert.equal(opened, 1);
  } finally {
    crcnBackendApi.getResorts = originalGetResorts;
  }
});
