import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});
const React = (await import('react')).default;
const { render, cleanup, fireEvent } = await import('@testing-library/react');
const { ExistingReservationStayCard } =
  await import('../src/components/booking/ExistingReservationStayCard.tsx');
after(() => dom.window.close());

test('shows booking reference and opens accessible property details with gallery and focus return', () => {
  const summary = {
    code: 'ZX91K',
    partnerCode: '123456',
    listingId: 'id',
    property: 'Apartamento',
    image: 'https://example.test/main.jpg',
    checkIn: '2026-11-13',
    checkOut: '2026-11-16',
    guests: 4,
    adults: 4,
    children: 0,
    infants: 0,
    totalCents: 10000,
    candidateBalanceCents: 10000,
    balanceStatus: 'pending_candidate',
    paymentEnabled: false,
    paymentMethods: [],
    cardInstallments: [],
    propertyDetails: {
      images: ['https://example.test/main.jpg', 'https://example.test/second.jpg'],
      description: 'Sala com: - Sofá',
      condoTitle: 'Condomínio',
      condoDescription: 'Piscina',
      condoImages: ['https://example.test/pool.jpg'],
    },
  };
  const view = render(React.createElement(ExistingReservationStayCard, { summary }));
  try {
    assert.ok(view.getByText('123456'));
    assert.ok(view.getByText('3 noites'));
    const changeLink = view.getByRole('link', { name: 'Desejo realizar alterações nos dados' });
    const message = new URL(changeLink.getAttribute('href')!).searchParams.get('text');
    assert.match(message!, /solicitar uma alteração nos dados da minha reserva/);
    assert.match(message!, /ZX91K/);
    assert.doesNotMatch(message!, /Houve uma falha/);
    const trigger = view.getByRole('button', { name: 'Ver fotos e detalhes de Apartamento' });
    assert.match(trigger.className, /focus-visible:outline/);
    trigger.focus();
    fireEvent.click(trigger);
    assert.ok(view.getByRole('dialog', { name: 'Apartamento' }));
    assert.match(
      view.getByRole('button', { name: 'Fechar detalhes da hospedagem' }).className,
      /focus-visible:outline/,
    );
    assert.match(
      view.getByRole('button', { name: 'Próxima foto' }).className,
      /focus-visible:outline/,
    );
    fireEvent.click(view.getByRole('button', { name: 'Próxima foto' }));
    assert.equal(
      view.getByAltText('Foto 2 da hospedagem').getAttribute('src'),
      'https://example.test/second.jpg',
    );
    fireEvent.click(view.getByRole('button', { name: 'Condomínio' }));
    assert.ok(view.getByText('Piscina'));
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' });
    assert.equal(view.queryByRole('dialog'), null);
    assert.equal(document.activeElement, trigger);
  } finally {
    cleanup();
  }
});
