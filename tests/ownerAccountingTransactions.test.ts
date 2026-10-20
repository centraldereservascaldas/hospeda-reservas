import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';

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
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const { OwnerAccountingTransactions } = await import(
  '../src/components/owner/OwnerAccountingTransactions.tsx'
);

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('opens accounting entry details in an accessible dialog and closes with Escape', () => {
  const { getByRole, queryByRole } = render(
    React.createElement(OwnerAccountingTransactions, {
      period: { from: '2026-10-01', to: '2026-10-31' },
      properties: [
        {
          staysListingId: 'listing-1',
          title: 'Apartamento Caldas',
          image: '',
          debit: 250,
          credit: 1200,
        },
      ],
      entries: [
        {
          id: 'entry-1',
          date: '2026-10-12',
          listingId: 'listing-1',
          propertyTitle: 'Apartamento Caldas',
          reservationId: 'reservation-1',
          reservationCode: 'ABC123',
          description: 'Repasse de hospedagem',
          publicNote: 'Pagamento referente à reserva.',
          type: 'credit',
          status: 'Pago',
          amount: 1200,
        },
      ],
    }),
  );

  const detailsButton = getByRole('button', { name: 'Detalhes' });
  fireEvent.click(detailsButton);

  const dialog = getByRole('dialog', { name: 'Detalhes do lançamento' });
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.match(dialog.textContent ?? '', /Pagamento referente à reserva\\./);
  assert.match(dialog.textContent ?? '', /ABC123/);

  fireEvent.keyDown(dialog, { key: 'Escape' });
  assert.equal(queryByRole('dialog'), null);
  assert.equal(document.activeElement, detailsButton);
});
